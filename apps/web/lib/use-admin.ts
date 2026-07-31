"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { useAuthStore } from "@/store/auth-store";
import type { Order } from "./order-types";

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** True when the signed-in user holds any staff role. */
export function useIsStaff(): boolean {
  const user = useAuthStore((s) => s.user);
  if (!user) return false;
  return user.roles.some((role) =>
    ["ADMIN", "SUPER_ADMIN", "MANAGER", "SUPPORT", "EDITOR"].includes(role),
  );
}

function useStaffQueryState() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);
  const isStaff = useIsStaff();
  return { accessToken, enabled: status === "authenticated" && Boolean(accessToken) && isStaff };
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface AdminOrder extends Order {
  user: { id: string; email: string; firstName: string; lastName: string };
  carrier: string | null;
  trackingNumber: string | null;
  statusHistory: {
    id: string;
    fromStatus: string;
    toStatus: string;
    note: string | null;
    createdAt: string;
    changedByUser: { id: string; email: string } | null;
  }[];
}

export function useAdminOrders(params: { status?: string; search?: string }) {
  const { accessToken, enabled } = useStaffQueryState();
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  return useQuery({
    queryKey: ["admin-orders", params.status ?? "", params.search ?? ""],
    enabled,
    queryFn: () =>
      apiFetch<Paginated<AdminOrder>>(`/v1/admin/orders?${query.toString()}`, {
        headers: authHeaders(accessToken),
      }),
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: ({ orderNumber, status, note }: { orderNumber: string; status: string; note?: string }) =>
      apiFetch<AdminOrder>(`/v1/admin/orders/${encodeURIComponent(orderNumber)}/status`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: { status, ...(note ? { note } : {}) },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-orders"] }),
  });
}

export interface AdminVendor {
  id: string;
  storeName: string;
  slug: string;
  status: "PENDING" | "APPROVED" | "SUSPENDED" | "REJECTED";
  commissionPct: string;
  createdAt: string;
  user: { id: string; email: string; firstName: string; lastName: string };
}

export function useAdminVendors(status?: string) {
  const { accessToken, enabled } = useStaffQueryState();
  return useQuery({
    queryKey: ["admin-vendors", status ?? ""],
    enabled,
    queryFn: () =>
      apiFetch<AdminVendor[]>(`/v1/admin/vendors${status ? `?status=${status}` : ""}`, {
        headers: authHeaders(accessToken),
      }),
  });
}

export function useUpdateVendorStatus() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: ({ id, status, commissionPct }: { id: string; status: string; commissionPct?: number }) =>
      apiFetch<AdminVendor>(`/v1/admin/vendors/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: { status, ...(commissionPct !== undefined ? { commissionPct } : {}) },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-vendors"] }),
  });
}

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerifiedAt: string | null;
  twoFactorEnabled: boolean;
  createdAt: string;
  roles: string[];
}

export function useAdminUsers(search?: string) {
  const { accessToken, enabled } = useStaffQueryState();
  return useQuery({
    queryKey: ["admin-users", search ?? ""],
    enabled,
    queryFn: () =>
      apiFetch<Paginated<AdminUser>>(
        `/v1/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`,
        { headers: authHeaders(accessToken) },
      ),
  });
}

export function useGrantRole() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiFetch<AdminUser>(`/v1/admin/users/${encodeURIComponent(userId)}/roles`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: { role },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}

export function useRevokeRole() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiFetch<AdminUser>(
        `/v1/admin/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(role)}`,
        { method: "DELETE", headers: authHeaders(accessToken) },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}
