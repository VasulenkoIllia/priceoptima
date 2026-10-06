// КП заявки: версії — незмінні знімки. Номер КП сталий (з Налаштувань), версії розрізняються датою й позначкою «фінальне».
import type { User } from '@prisma/client';
import { REQUEST_STATUS_LABELS } from '@shared/enums';
import { formatRequestNumber, toIsoDate } from '@shared/format';
import { approvalBaseKp, catalogSnapshotOf, kpBuyerOf, kpManagerName, kpVatModeFits } from '@shared/pricing';
import { buildKpVersion, KpBuildError, kpEventSummary, requestTotals } from '@shared/requests';
import { isEditableStatus } from '@shared/status';
import type { KpDocumentDto, UUID } from '@shared/types';
import { prisma } from '../../db';
import { audit } from '../audit/audit.service';
import { ApiError, notFound } from '../../http/errors';
import { mainImagesFor } from '../images/images.service';
import { listOwnCompanies } from '../own-companies/ownCompanies.service';
import { assertLockHolder } from './locks.service';
import { pricingEnv, productsByIds } from './requests.context';
import { toDocState, toKpDto, totalsData } from './requests.mapper';
import type { KpCreateInput } from './requests.schemas';
import { clientOrNull, kpsOf, loadRequest } from './requests.service';

const TX = { timeout: 30_000, maxWait: 10_000 };

/** Товари підбору заявки — щоб зібрати фото до транзакції. */
async function offerProductIds(requestId: UUID): Promise<string[]> {
  const rows = await prisma.requestOffer.findMany({ where: { requestId }, select: { productId: true } });
  return rows.map((r) => r.productId).filter((id): id is string => !!id);
}

/** Версії КП заявки, від найновішої. */
export async function listKps(requestId: UUID): Promise<KpDocumentDto[]> {
  const exists = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true } });
  if (!exists) throw notFound('Заявку не знайдено');
  return (await kpsOf(requestId)).reverse();
}

export async function createKp(requestId: UUID, body: KpCreateInput, actor: User, now = new Date()): Promise<KpDocumentDto> {
  const [env, owns] = await Promise.all([pricingEnv(now), listOwnCompanies()]);
  // фото збираємо до транзакції: перше звернення тягне їх із сайту постачальника, а транзакція не має чекати на мережу
  const images = body.settings.showImages ? await mainImagesFor(await offerProductIds(requestId)) : undefined;
  const kp = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Request" WHERE id = ${requestId} FOR UPDATE`;
    const r = await loadRequest(requestId, tx);
    if (!isEditableStatus(r.status)) {
      throw new ApiError('READ_ONLY', `Заявка в статусі «${REQUEST_STATUS_LABELS[r.status]}», КП не формується`);
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
    if (!body.final && !kpVatModeFits(body.settings.vatMode, own.isVatPayer)) {
      throw new ApiError(
        'VALIDATION_ERROR',
        own.isVatPayer ? `${own.nameShort} платник ПДВ: оберіть у КП ціни з ПДВ або без ПДВ` : `${own.nameShort} не платник ПДВ: у КП ПДВ не виділяється`,
      );
    }
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
        images,
        defaultTerms: env.settings.kpTerms,
        logoUrl: env.settings.logoUrl,
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
        // наступна після найбільшої: після видалення версії кількість уже не дорівнює останньому номеру
        version: kps.reduce((max, k) => Math.max(max, k.version), 0) + 1,
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


/**
 * Видалення версії КП (правки замовника 01.10 п.3: дубль від подвійного натискання). Може той, хто редагує заявку, з
 * підтвердженням у вікні. КП-основу погодження з уже погодженими позиціями не видаляємо: погоджена сума рахується за її цінами.
 */
export async function deleteKp(requestId: UUID, kpId: UUID, actor: User, sessionId: string, now = new Date()): Promise<void> {
  const env = await pricingEnv(now);
  const removed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Request" WHERE id = ${requestId} FOR UPDATE`;
    const r = await loadRequest(requestId, tx);
    if (!isEditableStatus(r.status)) {
      throw new ApiError('READ_ONLY', `Заявка в статусі «${REQUEST_STATUS_LABELS[r.status]}», лише перегляд`);
    }
    await assertLockHolder(tx, requestId, actor, sessionId, now);
    const kps = await kpsOf(requestId, tx);
    const target = kps.find((k) => k.id === kpId);
    if (!target) throw notFound('КП не знайдено');
    const state = toDocState(r);
    const base = approvalBaseKp(kps, state.header.approvalKpId);
    if (base?.id === target.id && state.lines.some((l) => l.approval?.approved)) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `КП № ${target.numberLabel} (версія ${target.version}) є основою погодження, у заявці вже є погоджені позиції. Спершу оберіть іншу КП-основу на вкладці «Погодження» або зніміть погодження`,
      );
    }
    await tx.kpDocument.delete({ where: { id: target.id } });
    const rest = kps.filter((k) => k.id !== target.id);
    const last = rest.reduce<KpDocumentDto | null>((acc, k) => (!acc || k.version > acc.version ? k : acc), null);
    // обрану основою видалену КП забуваємо (без погоджень основою стає остання звичайна)
    const approvalKpId = state.header.approvalKpId === target.id ? null : state.header.approvalKpId;
    await tx.request.update({
      where: { id: requestId },
      data: {
        ...totalsData(requestTotals({ ...state, header: { ...state.header, approvalKpId } }, env.ctx, rest)),
        approvalKpId,
        kpCount: rest.length,
        lastKpNumber: last?.kpNumber ?? null,
        lastKpFinal: last ? last.onlyApproved : null,
        updatedAt: now,
        updatedById: actor.id,
      },
    });
    const summary = `Видалено КП № ${target.numberLabel}${target.onlyApproved ? ' (фінальне)' : ''}, версія ${target.version}`;
    // вид події той самий, що й у формування КП («КП» в історії): стара версія програми при відкаті його знає
    await tx.requestEvent.create({ data: { requestId, at: now, userId: actor.id, kind: 'kp_created', summary } });
    return { summary, number: r.number };
  }, TX);
  await audit({
    userId: actor.id,
    action: 'request.kp.delete',
    entityType: 'request',
    entityId: requestId,
    summary: `${removed.summary} (заявка № ${formatRequestNumber(removed.number)})`,
  });
}
