"use client";

import { useState } from "react";
import { AddressForm } from "@/app/checkout/address-form";
import { useDeleteAddress, useMyAddresses, useSetDefaultAddress } from "@/lib/use-account";

export function AddressBook() {
  const { data: addresses, isLoading, error } = useMyAddresses();
  const deleteAddress = useDeleteAddress();
  const setDefault = useSetDefaultAddress();
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-sm text-slate-600 dark:text-slate-400">Loading addresses…</p>;
  }

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load your addresses: {error.message}
      </p>
    );
  }

  async function handleDelete(id: string) {
    setActionError(null);
    try {
      await deleteAddress.mutateAsync(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't remove that address.");
    }
  }

  async function handleSetDefault(id: string) {
    setActionError(null);
    try {
      await setDefault.mutateAsync(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't update your default address.");
    }
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {actionError}
        </p>
      )}

      {!addresses || addresses.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          You haven&apos;t saved any addresses yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="rounded-2xl border border-slate-200 p-5 text-sm dark:border-slate-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <address className="not-italic leading-relaxed">
                  <span className="font-medium">{address.fullName}</span>
                  {address.isDefault && (
                    <span className="ml-2 rounded-full bg-brand-gradient px-2.5 py-0.5 text-xs font-semibold text-white">
                      Default
                    </span>
                  )}
                  <br />
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}
                  <br />
                  {address.city}
                  {address.state ? `, ${address.state}` : ""} {address.postalCode ?? ""}{" "}
                  {address.country}
                  <br />
                  <span className="text-slate-500">{address.phone}</span>
                </address>

                <div className="flex gap-2">
                  {!address.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(address.id)}
                      disabled={setDefault.isPending}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium transition hover:border-brand-400 disabled:opacity-60 dark:border-slate-700"
                    >
                      Make default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(address.id)}
                    disabled={deleteAddress.isPending}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:border-red-400 disabled:opacity-60 dark:border-slate-700 dark:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Add an address
          </h2>
          <AddressForm onSaved={() => setAdding(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Add an address
        </button>
      )}
    </div>
  );
}
