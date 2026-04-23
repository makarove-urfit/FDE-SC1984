import { LayoutDashboard, Users } from "lucide-react";

export interface RouteItem {
  title: string;
  path: string;
  icon?: any;
  children?: RouteItem[];
}

// Sidebar 導航結構（可自由新增/修改/刪除）
export const routes: RouteItem[] = [
  { title: "範例儀錶板", path: "/", icon: LayoutDashboard },
  { title: "潛在客戶", path: "/leads", icon: Users },
];
