// Бланк КП (КП-1) у HTML — попередній перегляд і перегляд сформованих версій. PDF і Excel будуються з того самого знімка.
import { GlobalOutlined, MailFilled, PhoneFilled } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { formatMoney, formatQty } from '@shared/format';
import type { KpSnapshot } from '@shared/types';
import {
  KP_SIGN_LABEL,
  kpAmountLine,
  kpContacts,
  kpCountLine,
  kpHasHead,
  kpPartyRows,
  kpPartyTitle,
  kpTableHead,
  kpTermRows,
  kpTitle,
  kpTotalLines,
  kpValidLine,
  type KpContact,
} from './kpLayout';

const CONTACT_ICONS: Record<KpContact['kind'], ReactNode> = {
  phone: <PhoneFilled />,
  email: <MailFilled />,
  site: <GlobalOutlined />,
};

export interface KpDocumentViewProps {
  snapshot: KpSnapshot;
  /** Попередній перегляд (без номера). */
  draft?: boolean;
}

export function KpDocumentView({ snapshot: s, draft }: KpDocumentViewProps) {
  const valid = kpValidLine(s);
  const terms = kpTermRows(s);
  const photos = s.columns.showImages;
  const cols = photos ? 8 : 7;
  const contacts = kpContacts(s);
  return (
    <article className="po-kp-paper">
      {draft ? <div className="po-kp-draft">Попередній перегляд: КП ще не сформовано</div> : null}
      {kpHasHead(s, !!s.header.logoPath) ? (
        <header className="po-kp-head">
          <div className="po-kp-head-text">
            {s.header.slogan ? <div className="po-kp-slogan">{s.header.slogan}</div> : null}
            {contacts.length ? (
              <div className="po-kp-contacts">
                {contacts.map((c) => (
                  <span key={c.kind}>
                    {CONTACT_ICONS[c.kind]}
                    {c.text}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {s.header.logoPath ? <img className="po-kp-logo" src={s.header.logoPath} alt="" /> : null}
        </header>
      ) : null}

      <h2 className="po-kp-title po-num">{kpTitle(s)}</h2>
      {s.final ? <div className="po-kp-final">Фінальна: погоджені позиції і кількості</div> : null}

      <table className="po-kp-parties">
        <tbody>
          {kpPartyRows(s).map((r) => (
            <tr key={r.label} className={`po-kp-${r.kind}${r.gap ? ' po-kp-gap' : ''}`}>
              <th>{r.kind === 'party' ? <u>{r.label}</u> : r.label}</th>
              <td>
                {r.title ? <div className="po-kp-party-title">{kpPartyTitle(r.title)}</div> : null}
                {r.lines.map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="po-kp-table">
        <colgroup>
          <col style={{ width: '4%' }} />
          <col style={{ width: '12%' }} />
          {photos ? <col style={{ width: '7%' }} /> : null}
          <col />
          <col style={{ width: '7%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '13%' }} />
        </colgroup>
        <thead>
          <tr>
            {kpTableHead(s).map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.rows.length ? (
            s.rows.map((r) => (
              <tr key={r.lineId}>
                <td className="po-kp-c">{r.n}</td>
                <td className="po-num">{r.code ?? ''}</td>
                {photos ? (
                  <td className="po-kp-c">
                    {r.imagePath ? <img className="po-kp-photo-img" src={r.imagePath} alt="" /> : <span className="po-kp-photo" title="Місце під фото товару" />}
                  </td>
                ) : null}
                <td>
                  {r.name}
                  {r.nameSecondary ? <div className="po-kp-secondary">{r.nameSecondary}</div> : null}
                </td>
                <td className="po-kp-c">{r.unit}</td>
                <td className="po-kp-c po-num">{formatQty(r.qty)}</td>
                <td className="po-kp-r po-num">{formatMoney(r.price)}</td>
                <td className="po-kp-r po-num">{formatMoney(r.sum)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={cols} className="po-kp-c po-muted">
                Немає позицій з ціною продажу
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          {kpTotalLines(s).map((t) => (
            <tr key={t.label} className="po-kp-total">
              <th colSpan={cols - 1}>{t.label}</th>
              <td className="po-num">{formatMoney(t.value)}</td>
            </tr>
          ))}
        </tfoot>
      </table>

      <div className="po-kp-words">
        <div>{kpCountLine(s)}</div>
        <div>{kpAmountLine(s)}</div>
      </div>
      {valid ? <p>{valid}</p> : null}
      {terms.length ? (
        <table className="po-kp-terms">
          <tbody>
            {terms.map((t, i) => (
              <tr key={i}>
                <th>{t.label}</th>
                <td>{t.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {s.managerName ? <p className="po-kp-manager">Менеджер: {s.managerName}</p> : null}
      <div className="po-kp-bottom">
        {s.footer ? <p className="po-kp-footer">{s.footer}</p> : null}
        <div className={s.stampPath ? 'po-kp-sign po-kp-sign-stamped' : 'po-kp-sign'}>
          {KP_SIGN_LABEL} <span className="po-kp-sign-line" />
          {s.stampPath ? <img className="po-kp-stamp" src={s.stampPath} alt="" /> : null}
        </div>
      </div>
    </article>
  );
}
