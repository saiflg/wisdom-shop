"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface HostelAllocation {
  id: string;
  allocatedOn: string;
  releasedOn: string | null;
  allocatedByName: string;
  note: string | null;
  nights: number;
  studentProfile: { id: string; user: { firstName: string; lastName: string } };
}

export interface HostelRoom {
  id: string;
  name: string;
  beds: number;
  taken: number;
  free: number;
  /** More children than beds — reported, not prevented. */
  overfull: boolean;
  allocations: HostelAllocation[];
}

export interface Occupancy {
  rooms: number;
  beds: number;
  occupied: number;
  free: number;
  emptyRooms: number;
  overfullRooms: number;
}

export interface HostelBlock {
  id: string;
  name: string;
  wardenName: string | null;
  rooms: HostelRoom[];
  occupancy: Occupancy;
}

export interface StudentStay {
  id: string;
  allocatedOn: string;
  releasedOn: string | null;
  nights: number;
  current: boolean;
  note: string | null;
  room: { name: string; block: { name: string; wardenName: string | null } };
}

const KEY = ["hostel"];

export function useHostelBlocks() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "blocks"],
    enabled,
    queryFn: () => apiFetch<HostelBlock[]>("/v1/hostel/blocks", { headers: authHeaders(accessToken) }),
  });
}

export function useAddBlock() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; wardenName?: string }) =>
      apiFetch<HostelBlock>("/v1/hostel/blocks", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAddRoom() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { blockId: string; name: string; beds?: number }) =>
      apiFetch<HostelRoom>("/v1/hostel/rooms", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAllocateBed() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { roomId: string; studentProfileId: string; allocatedOn?: string }) =>
      apiFetch<HostelAllocation>("/v1/hostel/allocations", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReleaseBed() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ allocation: HostelAllocation; alreadyReleased: boolean }>(
        `/v1/hostel/allocations/${id}/release`,
        { method: "POST", headers: authHeaders(accessToken), body: {} },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useStudentStays(studentProfileId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "student", studentProfileId],
    enabled: enabled && Boolean(studentProfileId),
    queryFn: () =>
      apiFetch<StudentStay[]>(`/v1/hostel/students/${studentProfileId}`, {
        headers: authHeaders(accessToken),
      }),
  });
}
