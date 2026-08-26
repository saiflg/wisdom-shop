import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface LessonResourceRow {
  id: string;
  subjectId: string;
  subject?: { id: string; name: string; gradeLevel: string | null };
  title: string;
  url: string;
  kind: "VIDEO" | "DOCUMENT" | "LINK";
  keywords: string | null;
  hasCaptions: boolean;
  /** Present only for hosts the server is willing to embed. */
  embedUrl: string | null;
}

export interface CreateLessonResourceInput {
  subjectId: string;
  title: string;
  url: string;
  kind?: LessonResourceRow["kind"];
  keywords?: string;
  hasCaptions?: boolean;
}

const KEY = ["ai-teacher", "resources"];

export function useLessonResources(subjectId?: string) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, subjectId ?? "all"],
    enabled,
    queryFn: () =>
      apiFetch<LessonResourceRow[]>(
        `/v1/ai-teacher/resources${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ""}`,
        { headers: authHeaders(accessToken) },
      ),
  });
}

export function useAddLessonResource() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLessonResourceInput) =>
      apiFetch<LessonResourceRow>("/v1/ai-teacher/resources", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveLessonResource() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/ai-teacher/resources/${id}`, { method: "DELETE", headers: authHeaders(accessToken) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
