"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import {
  flattenCategories,
  useAdminCategories,
  useCanEditCatalog,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
  type AdminCategory,
} from "@/lib/use-catalog-admin";

const inputClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900";

function CategoryRow({
  category,
  depth,
  onRename,
  onDelete,
  busy,
}: {
  category: AdminCategory;
  depth: number;
  onRename: (id: string, name: string) => void;
  onDelete: (category: AdminCategory) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);

  return (
    <>
      <li className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <div
          className="flex flex-wrap items-center justify-between gap-3"
          style={{ paddingLeft: `${depth * 1.25}rem` }}
        >
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onRename(category.id, name);
                setEditing(false);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label={`Rename ${category.name}`}
                className={inputClass}
              />
              <button type="submit" className="text-sm font-medium text-brand-600 dark:text-brand-400">
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setName(category.name);
                  setEditing(false);
                }}
                className="text-sm text-slate-600 dark:text-slate-400"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="min-w-0">
              <p className="font-medium">{category.name}</p>
              <p className="text-xs text-slate-500">{category.slug}</p>
            </div>
          )}

          {!editing && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium transition hover:border-brand-400 dark:border-slate-700"
              >
                Rename
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete(category)}
                className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 transition hover:border-red-400 disabled:opacity-60 dark:border-red-900 dark:text-red-400"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </li>

      {category.children?.map((child) => (
        <CategoryRow
          key={child.id}
          category={child}
          depth={depth + 1}
          onRename={onRename}
          onDelete={onDelete}
          busy={busy}
        />
      ))}
    </>
  );
}

export function CategoryManager() {
  const canEdit = useCanEditCatalog();

  const { data: tree, isLoading, error } = useAdminCategories();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
        <p className="font-medium">You don&apos;t have permission to manage categories</p>
      </div>
    );
  }

  async function run(fn: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      // The API refuses to delete a category that still has products
      // attached, and says so — that message is more useful than a generic
      // failure, because it tells the admin what to do next.
      setActionError(err instanceof ApiError ? err.message : "That change was refused.");
    }
  }

  const parentOptions = flattenCategories(tree);

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void run(async () => {
            await create.mutateAsync({
              name: name.trim(),
              parentId: parentId || undefined,
            });
            setName("");
            setParentId("");
          });
        }}
        className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800"
      >
        <h2 className="text-lg font-semibold">Add a category</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          The slug is generated from the name. Categories are how the storefront filters, so keep
          them the words a customer would use.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name"
            aria-label="Category name"
            className={`${inputClass} min-w-[14rem] flex-1`}
          />
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            aria-label="Parent category"
            className={inputClass}
          >
            <option value="">No parent (top level)</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {create.isPending ? "Adding…" : "Add category"}
          </button>
        </div>
      </form>

      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {actionError}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading categories…</p>}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load categories: {error.message}
        </p>
      )}

      {tree && tree.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <p className="font-medium">No categories yet</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Add one above, then assign products to it.
          </p>
        </div>
      )}

      {tree && tree.length > 0 && (
        <ul className="space-y-2">
          {tree.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              depth={0}
              busy={remove.isPending}
              onRename={(id, newName) => {
                if (!newName.trim()) return;
                void run(() => update.mutateAsync({ id, name: newName.trim() }));
              }}
              onDelete={(target) => {
                if (!window.confirm(`Delete the "${target.name}" category?`)) return;
                void run(() => remove.mutateAsync(target.id));
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
