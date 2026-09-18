// КП заявки: версії — незмінні знімки. Номер КП сталий (з Налаштувань), версії розрізняються датою й позначкою «фінальне».
import type { User } from '@prisma/client';
import { REQUEST_STATUS_LABELS } from '@shared/enums';
import { toIsoDate } from '@shared/format';
import { catalogSnapshotOf, kpBuyerOf, kpManagerName } from '@shared/pricing';
import { buildKpVersion, KpBuildError, kpEventSummary, requestTotals } from '@shared/requests';
import { isEditableStatus } from '@shared/status';
import type { KpDocumentDto, UUID } from '@shared/types';
import { prisma } from '../../db';
import { ApiError, notFound } from '../../http/errors';
import { listOwnCompanies } from '../own-companies/ownCompanies.service';
import { assertLockHolder } from './locks.service';
import { pricingEnv, productsByIds } from './requests.context';
import { toDocState, toKpDto, totalsData } from './requests.mapper';
import type { KpCreateInput } from './requests.schemas';
import { clientOrNull, kpsOf, loadRequest } from './requests.service';

const TX = { timeout: 30_000, maxWait: 10_000 };

/** Версії КП заявки, від найновішої. */
export async function listKps(requestId: UUID): Promise<KpDocumentDto[]> {
  const exists = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true } });
  if (!exists) throw notFound('Заявку не знайдено');
  return (await kpsOf(requestId)).reverse();
}

export async function createKp(requestId: UUID, body: KpCreateInput, actor: User, now = new Date()): Promise<KpDocumentDto> {
  const [env, owns] = await Promise.all([pricingEnv(now), listOwnCompanies()]);
  const kp = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Request" WHERE id = ${requestId} FOR UPDATE`;
    const r = await loadRequest(requestId, tx);
    if (!isEditableStatus(r.status)) {
      throw new ApiError('READ_ONLY', `Заявка в статусі «${REQUEST_STATUS_LABELS[r.status]}» — КП не формується`);
    }
    await assertLockHolder(tx, requestId, actor, body.sessionId, now);

    const state = toDocState(r);
    // стан каталогу — для «Назва 1С», завантаженої вже після підбору товару
    const products = await productsByIds(state.offers.map((o) => o.productId));
    const offers = state.offers.map((o) => {
      const p = o.productId ? products.get(o.productId) : undefined;
      return p ? { ...o, catalog: catalogSnapshotOf(p) } : o;
    });
    const client = await clientOrNull(state.header.clientId);
    const cp = client?.counterparties.find((c) => c.id === state.header.counterpartyId);
    const contact = client?.contacts.find((c) => c.id === state.header.contactId);
    const own = owns.find((c) => c.id === state.header.ownCompanyId) ?? owns[0];
    if (!own) throw new ApiError('VALIDATION_ERROR', 'Спершу додайте нашу юрособу в Налаштуваннях');
    const manager = await tx.user.findUnique({ where: { id: state.header.managerId }, select: { shortName: true, phone: true } });
    const kps = await kpsOf(requestId, tx);

    let built;
    try {
      built = buildKpVersion({
        state: { ...state, offers },
        kps,
        settings: body.settings,
        final: !!body.final,
        kpNumber: env.settings.nextKpNumber,
        date: toIsoDate(now),
        ctx: env.ctx,
        parties: { ownCompanyId: own.id, seller: own, buyer: kpBuyerOf(cp, client?.name, contact), managerName: kpManagerName(manager) },
        defaultTerms: env.settings.kpTerms,
      });
    } catch (e) {
      if (e instanceof KpBuildError) throw new ApiError(e.code, e.message);
      throw e;
    }
    const { snapshot } = built;
    const row = await tx.kpDocument.create({
      data: {
        requestId,
        kpNumber: env.settings.nextKpNumber,
        version: kps.length + 1,
        vatMode: snapshot.totals.vatMode,
        ownCompanyId: built.ownCompanyId,
        onlyApproved: !!body.final,
        settings: built.settings as object,
        totalNet: snapshot.totals.totalNet,
        totalVat: snapshot.totals.vat,
        totalGross: snapshot.totals.totalGross,
        snapshot: snapshot as object,
        createdAt: now,
        createdById: actor.id,
      },
    });
    const dto = toKpDto(row, new Map([[actor.id, { id: actor.id, shortName: actor.shortName }]]));
    const all = [...kps, dto];
    // версію документа не змінюємо: КП — окремий знімок, незбережені правки вкладки лишаються чинними
    await tx.request.update({
      where: { id: requestId },
      data: {
        ...totalsData(requestTotals(state, env.ctx, all)),
        kpCount: all.length,
        lastKpNumber: dto.kpNumber,
        lastKpFinal: dto.onlyApproved,
        updatedAt: now,
        updatedById: actor.id,
      },
    });
    const ownName = owns.find((c) => c.id === dto.ownCompanyId)?.nameShort ?? '';
    await tx.requestEvent.create({
      data: { requestId, at: now, userId: actor.id, kind: 'kp_created', summary: kpEventSummary(dto, ownName) },
    });
    return dto;
  }, TX);
  return kp;
}

