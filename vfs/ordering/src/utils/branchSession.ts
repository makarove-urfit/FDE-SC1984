const KEY = "selected_branch";

export interface SelectedBranch {
  branch_id: string;
  branch_name: string;
  hq_name: string;
}

export function getSelectedBranch(): SelectedBranch | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && typeof data.branch_id === "string" && data.branch_id) return data as SelectedBranch;
    return null;
  } catch {
    return null;
  }
}

export function setSelectedBranch(b: SelectedBranch): void {
  localStorage.setItem(KEY, JSON.stringify(b));
}

export function clearSelectedBranch(): void {
  localStorage.removeItem(KEY);
}
