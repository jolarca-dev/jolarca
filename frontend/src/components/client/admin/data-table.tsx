"use client";

/**
 * Reusable admin data table — TanStack Table v8 with sorting, global
 * filtering and client-side pagination. Accessibility: real <table>
 * semantics, aria-sort on headers, keyboard-sortable headers (buttons),
 * and an aria-live channel announcing sort/filter/page changes.
 */
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

interface DataTableProps<T> {
  columns: Array<ColumnDef<T, unknown>>;
  rows: T[];
  /** Stable row identity — required for selection; defaults to index. */
  getRowId?: (row: T) => string;
  filterPlaceholder?: string;
  pageSize?: number;
  enableSelection?: boolean;
  onSelectionChange?: (selectedIds: string[]) => void;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  filterPlaceholder,
  pageSize = 10,
  enableSelection = false,
  onSelectionChange,
  emptyMessage,
}: DataTableProps<T>) {
  const t = useTranslations("admin");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [announce, setAnnounce] = useState("");

  // Selection checkbox column is prepended only when bulk actions are on.
  const allColumns = useMemo(() => {
    if (!enableSelection) return columns;
    const selection: ColumnDef<T, unknown> = {
      id: "_select",
      enableSorting: false,
      header: () => <span className="sr-only">{t("selectColumn")}</span>,
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
          aria-label={t("selectRow")}
          className="h-4 w-4 accent-(--tok-primary)"
        />
      ),
    };
    return [selection, ...columns];
  }, [columns, enableSelection, t]);

  const table = useReactTable({
    data: rows,
    columns: allColumns,
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getRowId: getRowId ? getRowId : (_row, index) => String(index),
    enableRowSelection: enableSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  // Keep parents (bulk-action toolbars) informed about selection.
  useEffect(() => {
    onSelectionChange?.(Object.keys(rowSelection));
  }, [rowSelection, onSelectionChange]);

  // Screen-reader channel for sort/filter/page changes.
  useEffect(() => {
    if (sorting.length === 0) return;
    const first = sorting[0];
    if (!first) return;
    setAnnounce(
      t("sortAnnounce", {
        direction: first.desc ? t("sortDesc") : t("sortAsc"),
      }),
    );
  }, [sorting, t]);

  useEffect(() => {
    setAnnounce(
      globalFilter
        ? t("filterAnnounce", {
            count: table.getFilteredRowModel().rows.length,
          })
        : "",
    );
  }, [globalFilter, table, t]);

  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={filterPlaceholder ?? t("filterPlaceholder")}
          aria-label={filterPlaceholder ?? t("filterPlaceholder")}
          className="w-full max-w-xs rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-ink transition-dignified focus:border-primary focus:outline-2 focus:outline-primary/40"
        />
        <span className="text-sm text-ink-faint">
          {t("rowCount", { count: table.getFilteredRowModel().rows.length })}
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b border-line bg-surface"
              >
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : "none"
                      }
                      className="px-3 py-2 text-start font-medium text-ink-muted"
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 rounded transition-dignified hover:text-primary-deep focus:outline-2 focus:outline-primary/40"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          <span aria-hidden="true" className="text-xs">
                            {sorted === "asc"
                              ? "▲"
                              : sorted === "desc"
                                ? "▼"
                                : "↕"}
                          </span>
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={allColumns.length}
                  className="px-3 py-8 text-center text-ink-muted"
                >
                  {emptyMessage ?? t("emptyTable")}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-line/60 transition-dignified hover:bg-surface"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-top text-ink">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav
          aria-label={t("pagination")}
          className="mt-4 flex items-center justify-between"
        >
          <button
            type="button"
            onClick={() => {
              table.previousPage();
              setAnnounce(t("pageAnnounce", { page: pageIndex }));
            }}
            disabled={!table.getCanPreviousPage()}
            className="rounded-md border border-line px-4 py-1.5 text-sm text-ink transition-dignified hover:border-line-strong disabled:opacity-50"
          >
            {t("pagePrev")}
          </button>
          <span className="text-sm text-ink-faint">
            {t("pageInfo", { page: pageIndex + 1, totalPages: pageCount })}
          </span>
          <button
            type="button"
            onClick={() => {
              table.nextPage();
              setAnnounce(t("pageAnnounce", { page: pageIndex + 2 }));
            }}
            disabled={!table.getCanNextPage()}
            className="rounded-md border border-line px-4 py-1.5 text-sm text-ink transition-dignified hover:border-line-strong disabled:opacity-50"
          >
            {t("pageNext")}
          </button>
        </nav>
      )}

      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
    </div>
  );
}
