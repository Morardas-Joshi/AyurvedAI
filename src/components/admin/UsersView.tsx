import { useMemo, useState } from "react";
import { api, downloadCsv, errorText, formatDate, formatDateTime, timeAgo } from "./api";
import type { User } from "./types";
import { td, th, tr, useAdminData, useNotify, usePaged } from "./hooks";
import {
  Avatar,
  ConfirmDialog,
  EmptyRow,
  FilterTabs,
  IconButton,
  Modal,
  Pagination,
  Panel,
  PanelHeader,
  PrimaryButton,
  SearchInput,
  SecondaryButton,
  SelectField,
  StatusBadge,
  TableShell,
  TextField,
} from "./ui";
import { Icons } from "./icons";

type StatusFilter = "all" | "active" | "inactive";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function UserFormModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const notify = useNotify();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">(user?.status ?? "active");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return setError("Name is required.");
    if (!EMAIL_RE.test(email.trim())) return setError("Please enter a valid email address.");
    if (!user) {
      if (password.length < 8) return setError("Password must be at least 8 characters.");
      if (password !== confirm) return setError("Passwords do not match.");
    }
    setError("");
    setSaving(true);
    try {
      const data = user
        ? await api<{ message: string }>(`/users/${user.id}`, { method: "PUT", json: { name: name.trim(), email: email.trim() } })
        : await api<{ message: string }>("/users", { method: "POST", json: { name: name.trim(), email: email.trim(), password, status } });
      notify("success", data.message);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={user ? "Edit User" : "Add User"}
      subtitle={user ? `Update the account details of ${user.name}.` : "Create a new user account. The user can sign in immediately."}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => void save()} disabled={saving} icon={<Icons.Check />}>{saving ? "Saving…" : user ? "Save Changes" : "Add User"}</PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Full name" value={name} onChange={setName} required maxLength={50} autoFocus />
        <TextField label="Email address" type="email" value={email} onChange={setEmail} required maxLength={50} />
        {!user && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Password" type="password" value={password} onChange={setPassword} required hint="Minimum 8 characters" maxLength={128} />
              <TextField label="Confirm password" type="password" value={confirm} onChange={setConfirm} required maxLength={128} />
            </div>
            <SelectField label="Account status" value={status} onChange={(value) => setStatus(value as "active" | "inactive")} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
          </>
        )}
        {error && <p role="alert" className="rounded-lg border border-[#E8967A]/25 bg-[#E8967A]/10 px-3 py-2 text-sm text-[#F0B5A2]">{error}</p>}
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const notify = useNotify();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setSaving(true);
    try {
      const data = await api<{ message: string }>(`/users/${user.id}/reset-password`, { method: "POST", json: { new_password: password } });
      notify("success", data.message);
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Reset Password"
      subtitle={<>Set a new password for <span className="text-[#A9C97C]">{user.email}</span>. Share it with the user securely.</>}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => void save()} disabled={saving} icon={<Icons.Key />}>{saving ? "Saving…" : "Reset Password"}</PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="New password" type="password" value={password} onChange={setPassword} required hint="Minimum 8 characters" autoFocus maxLength={128} />
        <TextField label="Confirm new password" type="password" value={confirm} onChange={setConfirm} required maxLength={128} />
        {error && <p role="alert" className="rounded-lg border border-[#E8967A]/25 bg-[#E8967A]/10 px-3 py-2 text-sm text-[#F0B5A2]">{error}</p>}
      </div>
    </Modal>
  );
}

export default function UsersView() {
  const notify = useNotify();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [formTarget, setFormTarget] = useState<User | "new" | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, setData, loading, reload: load } = useAdminData<{ users: User[] }>("/users");
  const users = useMemo(() => data?.users ?? [], [data]);
  const setUsers = (update: (current: User[]) => User[]) => setData((current) => current && { ...current, users: update(current.users) });

  const counts = useMemo(() => ({ all: users.length, active: users.filter((u) => u.status === "active").length, inactive: users.filter((u) => u.status !== "active").length }), [users]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => (filter === "all" || user.status === filter) && (!term || user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)));
  }, [users, search, filter]);
  const paged = usePaged(filtered, 10, `${search}|${filter}`);

  const toggleStatus = async (user: User) => {
    const status = user.status === "active" ? "inactive" : "active";
    try {
      await api(`/users/${user.id}/status`, { method: "PATCH", json: { status } });
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, status } : item)));
      notify("success", `${user.name} is now ${status}.`);
    } catch (err) {
      notify("error", errorText(err));
    }
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api(`/users/${deleteTarget.id}`, { method: "DELETE" });
      setUsers((current) => current.filter((item) => item.id !== deleteTarget.id));
      notify("success", `${deleteTarget.name} was deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () =>
    downloadCsv(
      "ayurvedai-users",
      ["ID", "Name", "Email", "Status", "Joined", "Last login"],
      filtered.map((user) => [user.id, user.name, user.email, user.status, formatDateTime(user.created_at), formatDateTime(user.last_login)]),
    );

  return (
    <>
      <Panel>
        <PanelHeader
          title="All Users"
          subtitle="Add, edit, activate or remove registered accounts."
          actions={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search name or email" />
              <SecondaryButton onClick={exportCsv} icon={<Icons.Download />} disabled={!filtered.length}>Export CSV</SecondaryButton>
              <PrimaryButton onClick={() => setFormTarget("new")} icon={<Icons.Plus />}>Add User</PrimaryButton>
            </>
          }
        />
        <div className="border-b border-white/10 px-6 py-3">
          <FilterTabs<StatusFilter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: counts.all },
              { value: "active", label: "Active", count: counts.active },
              { value: "inactive", label: "Inactive", count: counts.inactive },
            ]}
          />
        </div>
        <TableShell minWidth={900}>
          <thead>
            <tr className="border-b border-white/10">
              <th className={th}>User</th>
              <th className={th}>Email</th>
              <th className={th}>Joined</th>
              <th className={th}>Last login</th>
              <th className={th}>Status</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading || !paged.pageItems.length ? (
              <EmptyRow colSpan={6} loading={loading} text={search || filter !== "all" ? "No users match your filters." : "No users registered yet."} />
            ) : (
              paged.pageItems.map((user) => (
                <tr key={user.id} className={tr}>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <Avatar text={user.name} />
                      <div>
                        <p className="font-medium text-[#EAF2DD]">{user.name}</p>
                        <p className="mt-0.5 text-xs text-[#71806C]">ID #{user.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className={td}>{user.email}</td>
                  <td className={td}>{formatDate(user.created_at)}</td>
                  <td className={td}>
                    {user.last_login ? (
                      <span title={formatDateTime(user.last_login)}>{timeAgo(user.last_login)}</span>
                    ) : (
                      <span className="text-[#71806C]">Never</span>
                    )}
                  </td>
                  <td className={td}>
                    <button type="button" onClick={() => void toggleStatus(user)} title={`Click to ${user.status === "active" ? "deactivate" : "activate"}`} className="rounded-lg transition hover:brightness-125">
                      <StatusBadge status={user.status} />
                    </button>
                  </td>
                  <td className={td}>
                    <div className="flex justify-end gap-2">
                      <IconButton label={`Edit ${user.name}`} onClick={() => setFormTarget(user)}><Icons.Edit /></IconButton>
                      <IconButton label={`Reset password for ${user.name}`} tone="amber" onClick={() => setResetTarget(user)}><Icons.Key /></IconButton>
                      <IconButton label={`Delete ${user.name}`} tone="red" onClick={() => setDeleteTarget(user)}><Icons.Trash /></IconButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
        <Pagination {...paged} total={filtered.length} noun="users" onChange={paged.setPage} />
      </Panel>

      {formTarget && <UserFormModal user={formTarget === "new" ? null : formTarget} onClose={() => setFormTarget(null)} onSaved={() => void load()} />}
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete User?"
          message={<>Are you sure you want to delete <span className="font-medium text-[#A9C97C]">{deleteTarget.name}</span> ({deleteTarget.email})? Their login history will also be removed.</>}
          busy={busy}
          onConfirm={() => void deleteUser()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
