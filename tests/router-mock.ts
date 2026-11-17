import { vi } from "vitest";

/** Roteador falso compartilhado; cada teste confere as chamadas. */
export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
}));
