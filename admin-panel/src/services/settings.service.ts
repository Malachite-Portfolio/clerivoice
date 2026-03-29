import { api } from "@/services/http";
import type { ApiResponse, AppSettings } from "@/types";

export const settingsService = {
  async getSettings() {
    const response = await api.get<ApiResponse<AppSettings>>("/admin/settings");
    return response.data.data;
  },

  async updateSettings(settings: Partial<AppSettings>) {
    const response = await api.patch<ApiResponse<AppSettings>>(
      "/admin/settings",
      settings,
    );
    return response.data.data;
  },
};
