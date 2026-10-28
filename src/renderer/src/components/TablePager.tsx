interface Props {
  idPrefix: string;
  total: number;
  page: number;
  size: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}

const PAGE_SIZES = [10, 25, 50, 100];

/** Shared table footer — page-size selector plus prev/next paging for any table view. */
export default function TablePager({ idPrefix, total, page, size, onPage, onSize }: Props) {
  const pageCount = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min(total, (page + 1) * size);

  return (
    <div className="tbl-pager" id={`${idPrefix}-pager`}>
      <label className="tbl-pager-size" htmlFor={`${idPrefix}-size`}>
        Rows
        <select
          id={`${idPrefix}-size`}
          className="select"
          value={size}
          onChange={(e) => {
            onSize(Number(e.target.value));
            onPage(0);
          }}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <span className="tbl-pager-range" id={`${idPrefix}-range`}>
        {from}–{to} of {total}
      </span>
      <button
        type="button"
        className="tbl-pager-btn"
        id={`${idPrefix}-prev`}
        disabled={page <= 0}
        onClick={() => onPage(page - 1)}
        title="Previous page"
        aria-label="Previous page"
      >
        ‹
      </button>
      <button
        type="button"
        className="tbl-pager-btn"
        id={`${idPrefix}-next`}
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
        title="Next page"
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}
