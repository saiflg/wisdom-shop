"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormField } from "@/components/form-field";
import { useCreateAddress } from "@/lib/use-checkout";

// Mirrors CreateAddressDto in the API.
const schema = z.object({
  fullName: z.string().min(1, "Required").max(150),
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Enter a valid phone number, e.g. +2348012345678"),
  line1: z.string().min(1, "Required").max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1, "Required").max(100),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().regex(/^[A-Z]{2}$/, "Use a 2-letter country code, e.g. NG"),
});

type Values = z.infer<typeof schema>;

export function AddressForm({ onSaved }: { onSaved: (addressId: string) => void }) {
  const createAddress = useCreateAddress();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { country: "NG" } });

  const onSubmit = form.handleSubmit(async (values) => {
    const address = await createAddress.mutateAsync({
      ...values,
      // Omit optional fields rather than sending empty strings, which would
      // fail the API's length/format validation.
      line2: values.line2 || undefined,
      state: values.state || undefined,
      postalCode: values.postalCode || undefined,
      label: null,
    } as never);
    onSaved(address.id);
  });

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
      <FormField label="Full name" error={form.formState.errors.fullName?.message} {...form.register("fullName")} />
      <FormField label="Phone" error={form.formState.errors.phone?.message} {...form.register("phone")} />
      <FormField label="Address line 1" error={form.formState.errors.line1?.message} {...form.register("line1")} />
      <FormField label="Address line 2 (optional)" error={form.formState.errors.line2?.message} {...form.register("line2")} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="City" error={form.formState.errors.city?.message} {...form.register("city")} />
        <FormField label="State (optional)" error={form.formState.errors.state?.message} {...form.register("state")} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Postal code (optional)" error={form.formState.errors.postalCode?.message} {...form.register("postalCode")} />
        <FormField label="Country code" error={form.formState.errors.country?.message} {...form.register("country")} />
      </div>

      {createAddress.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {createAddress.error.message}
        </p>
      )}

      <button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:border-brand-400 disabled:opacity-60 dark:border-slate-700"
      >
        {form.formState.isSubmitting ? "Saving…" : "Save address"}
      </button>
    </form>
  );
}
