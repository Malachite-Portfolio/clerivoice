import { api } from "@/services/http";
import type { ApiResponse, SidebarData } from "@/types";

export const appService = {
  async getSidebarData() {
    const response = await api.get<ApiResponse<SidebarData>>("/admin/app/sidebar");
    return response.data.data;
  },
};
