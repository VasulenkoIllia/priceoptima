// Бланк КП (КП-1) у HTML — попередній перегляд і перегляд сформованих версій. PDF і Excel будуються з того самого знімка.
import { formatMoney, formatQty } from '@shared/format';
import type { KpSnapshot } from '@shared/types';
import { kpAmountLine, kpContactsLine, kpPartyRows, kpTitle, kpTotalLines, kpValidLine } from './kpLayout';

export interface KpDocumentViewProps {
  snapshot: KpSnapshot;
  /** Попередній перегляд (без номера). */
  draft?: boolean;
}

export function KpDocumentView({ snapshot: s, draft }: KpDocumentViewProps) {
  const valid = kpValidLine(s);
  const photos = s.columns.showImages;
  return (
    <article className="po-kp-paper">
      {draft ? <div className="po-kp-draft">Попередній перегляд — номер присвоїться при формуванні</div> : null}
      <header className="po-kp-head">
        {s.header.logoPath ? <img className="po-kp-logo" src={s.header.logoPath} alt="" /> : null}
        <div>
          {s.header.slogan ? <div className="po-kp-slogan">{s.header.slogan}</div> : null}
          <div className="po-kp-contacts">{kpContactsLine(s)}</div>
        </div>
      </header>

      <h2 className="po-kp-title po-num">{kpTitle(s)}</h2>
      {s.final ? <div className="po-kp-final">Фінальна: погоджені позиції і кількості</div> : null}

      <table className="po-kp-parties">
        <tbody>
          {kpPartyRows(s).map((r) => (
            <tr key={r.label}>
              <th>{r.label}</th>
              <td>
                {r.title ? <b>{r.title}</b> : null}
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
          <col style={{ width: '6%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '13%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>№</th>
            <th>Код</th>
            {photos ? <th>Фото</th> : null}
            <th>Товари (роботи, послуги)</th>
            <th>Од.</th>
            <th>Кількість</th>
            <th>{s.columns.priceHeader}</th>
            <th>{s.columns.sumHeader}</th>
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
                <td className="po-kp-r po-num">{formatQty(r.qty)}</td>
                <td className="po-kp-r po-num">{formatMoney(r.price)}</td>
                <td className="po-kp-r po-num">{formatMoney(r.sum)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={photos ? 8 : 7} className="po-kp-c po-muted">
                Немає позицій з ціною продажу
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <table className="po-kp-totals">
        <tbody>
          {kpTotalLines(s).map((t) => (
            <tr key={t.label} className={t.strong ? 'po-kp-strong' : undefined}>
              <th>{t.label}</th>
              <td className="po-num">{formatMoney(t.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="po-kp-words">{kpAmountLine(s)}</p>
      {valid ? <p>{valid}</p> : null}
      <p className="po-kp-manager">Менеджер: {s.managerName}</p>
      {s.footer ? <p className="po-kp-footer">{s.footer}</p> : null}
    </article>
  );
}
