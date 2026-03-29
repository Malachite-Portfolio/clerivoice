import { api } from "@/services/http";
import type { ApiResponse, AuthSession, LoginPayload } from "@/types";
import type { AdminRole } from "@/types";

function normalizeRole(value?: string): AdminRole {
  const normalized = String(value ?? "admin").toLowerCase();
  if (normalized === "super_admin" || normalized === "superadmin") {
    return "super_admin";
  }
  if (normalized === "support_manager" || normalized === "supportmanager") {
    return "support_manager";
  }
  return "admin";
}

function mapSessionResponse(rawData: Record<string, unknown>, fallbackLoginId: string): AuthSession {
  const user = (rawData.user as Record<string, unknown> | undefined) ?? rawData;

  return {
    accessToken: String(rawData.accessToken ?? rawData.token ?? ""),
    refreshToken: String(rawData.refreshToken ?? ""),
    role: normalizeRole(String(rawData.role ?? user.role ?? "admin")),
    adminId: String(user.id ?? rawData.adminId ?? "admin-local"),
    name: String(user.displayName ?? user.name ?? "Admin"),
    email: String(user.email ?? fallbackLoginId),
  };
}

export const authService = {
  async login(payload: LoginPayload): Promise<AuthSession> {
    const emailOrPhone = payload.emailOrPhone.trim();
    const password = payload.password;

    const attempts = [
      {
        url: "/admin/auth/login",
        body: {
          phoneOrEmail: emailOrPhone,
          password,
        },
      },
      {
        url: "/auth/login",
        body: {
          phoneOrEmail: emailOrPhone,
          password,
        },
      },
    ];

    let lastError: unknown;

    for (const attempt of attempts) {
      try {
        const response = await api.post<ApiResponse<Record<string, unknown>>>(
          attempt.url,
          attempt.body,
        );

        return mapSessionResponse(response.data.data, emailOrPhone);
      } catch (error) {
        lastError = error;
      }
    }

    if (
      process.env.NODE_ENV === "development" &&
      emailOrPhone.toLowerCase() === "admin25" &&
      password === "Admin@123"
    ) {
      return {
        accessToken: "demo-access-token",
        refreshToken: "demo-refresh-token",
        role: "admin",
        adminId: "admin25-demo",
        name: "Clarivoice Admin",
        email: "admin25",
      };
    }

    throw lastError;
  },

  async me(): Promise<{
    id: string;
    name: string;
    email: string;
    role: AdminRole;
  }> {
    try {
      const response = await api.get<ApiResponse<Record<string, unknown>>>("/admin/me");
      const user = response.data.data;
      return {
        id: String(user.id ?? ""),
        name: String(user.displayName ?? user.name ?? "Admin"),
        email: String(user.email ?? ""),
        role: normalizeRole(String(user.role ?? "admin")),
      };
    } catch {
      const response = await api.get<ApiResponse<Record<string, unknown>>>("/me");
      const user = response.data.data;
      return {
        id: String(user.id ?? ""),
        name: String(user.displayName ?? user.name ?? "Admin"),
        email: String(user.email ?? ""),
        role: normalizeRole(String(user.role ?? "admin")),
      };
    }
  },

  async logout(refreshToken: string) {
    try {
      await api.post<ApiResponse<{ revoked: boolean }>>("/admin/auth/logout", {
        refreshToken,
      });
    } catch {
      await api.post<ApiResponse<{ revoked: boolean }>>("/auth/logout", {
        refreshToken,
      });
    }
  },
};
