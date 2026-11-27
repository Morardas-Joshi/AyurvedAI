import { useMemo, useRef, useState } from "react";
import { api, downloadCsv, errorText, formatDateTime, formatFileSize } from "./api";
import type { DocumentItem } from "./types";
import { td, th, tr, useAdminData, useNotify, usePaged } from "./hooks";
import {
  ConfirmDialog,
  EmptyRow,
  IconButton,
  Modal,
  Pagination,
  Panel,
  PanelHeader,
  PrimaryButton,
  SearchInput,
  SecondaryButton,
  TableShell,
  TextField,
} from "./ui";
import { Icons } from "./icons";

export default function KnowledgeBaseView() {
  const notify = useNotify();
  const fileInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [editTarget, setEditTarget] = useState<DocumentItem | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, reload: load } = useAdminData<{ documents: DocumentItem[] }>("/documents");
  const documents = useMemo(() => data?.documents ?? [], [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? documents.filter((doc) => doc.filename.toLowerCase().includes(term)) : documents;
  }, [documents, search]);
  const paged = usePaged(filtered, 8, search);
  const totalSize = documents.reduce((sum, doc) => sum + doc.size, 0);
  const totalChunks = documents.reduce((sum, doc) => sum + (doc.chunks ?? 0), 0);

  const upload = async () => {
    if (!file) return notify("error", "Please select a file first.");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", name.trim());
      const data = await api<{ message: string }>("/documents", { method: "POST", body: form });
      notify("success", `${data.message} The knowledge base has been re-indexed.`);
      setFile(null);
      setName("");
      if (fileInput.current) fileInput.current.value = "";
      load();
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setUploading(false);
    }
  };

  const rename = async () => {
    if (!editTarget) return;
    if (!editName.trim()) return notify("error", "File name cannot be empty.");
    setBusy(true);
    try {
      const data = await api<{ message: string }>(`/documents/${encodeURIComponent(editTarget.filename)}`, { method: "PUT", json: { new_name: editName.trim() } });
      notify("success", data.message);
      setEditTarget(null);
      load();
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const data = await api<{ message: string }>(`/documents/${encodeURIComponent(deleteTarget.filename)}`, { method: "DELETE" });
      notify("success", data.message);
      setDeleteTarget(null);
      load();
    } catch (err) {
      notify("error", errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel padded>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-admin-display text-xl text-[#EAF2DD]">Upload Document</h2>
            <p className="mt-1 text-sm text-[#8FA080]">Add a PDF, DOCX, TXT or MD file. The AI assistant uses these documents to answer questions.</p>
          </div>
          <p className="text-xs text-[#71806C]">
            {documents.length} files · {formatFileSize(totalSize)} · {totalChunks} indexed chunks
          </p>
        </div>
        <div className="mt-5 grid items-end gap-4 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label htmlFor="kb-file" className="mb-1.5 block text-xs uppercase tracking-wider text-[#8FA080]">
              Select file<span className="ml-0.5 text-[#E8967A]">*</span>
            </label>
            <input
              ref={fileInput}
              id="kb-file"
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#A6B399] file:mr-3 file:rounded-lg file:border-0 file:bg-[#8FAF5A]/20 file:px-3 file:py-1 file:text-[#D5E6C0]"
            />
          </div>
          <TextField label="File name" value={name} onChange={setName} placeholder="Optional — keeps original name if empty" maxLength={150} />
          <PrimaryButton onClick={() => void upload()} disabled={uploading} icon={<Icons.Upload />}>
            {uploading ? "Uploading…" : "Upload"}
          </PrimaryButton>
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="All Documents"
          subtitle="Files indexed for the AI assistant's knowledge base."
          actions={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search documents" />
              <SecondaryButton
                icon={<Icons.Download />}
                disabled={!filtered.length}
                onClick={() =>
                  downloadCsv(
                    "ayurvedai-knowledge-base",
                    ["File name", "Type", "Size", "Indexed chunks", "Added"],
                    filtered.map((doc) => [doc.filename, doc.extension.replace(".", "").toUpperCase(), formatFileSize(doc.size), doc.chunks ?? "", formatDateTime(doc.uploaded_at)]),
                  )
                }
              >
                Export CSV
              </SecondaryButton>
            </>
          }
        />
        <TableShell minWidth={760}>
          <thead>
            <tr className="border-b border-white/10">
              <th className={th}>File name</th>
              <th className={th}>Size</th>
              <th className={th}>Indexed chunks</th>
              <th className={th}>Added</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading || !paged.pageItems.length ? (
              <EmptyRow colSpan={5} loading={loading} text={search ? "No documents match your search." : "No documents uploaded yet."} />
            ) : (
              paged.pageItems.map((doc) => (
                <tr key={doc.filename} className={tr}>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#8FAF5A]/20 bg-[#8FAF5A]/10 text-[#A9C97C]">
                        <Icons.Documents />
                      </div>
                      <div className="min-w-0">
                        <p className="max-w-[360px] truncate font-medium text-[#EAF2DD]">{doc.name}</p>
                        <p className="mt-0.5 text-xs uppercase text-[#71806C]">{doc.extension.replace(".", "")}</p>
                      </div>
                    </div>
                  </td>
                  <td className={td}>{formatFileSize(doc.size)}</td>
                  <td className={td}>{doc.chunks ?? <span className="text-[#E6D49A]">Not indexed</span>}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatDateTime(doc.uploaded_at)}</td>
                  <td className={td}>
                    <div className="flex justify-end gap-2">
                      <IconButton
                        label={`Rename ${doc.filename}`}
                        onClick={() => {
                          setEditTarget(doc);
                          setEditName(doc.name);
                        }}
                      >
                        <Icons.Edit />
                      </IconButton>
                      <IconButton label={`Delete ${doc.filename}`} tone="red" onClick={() => setDeleteTarget(doc)}>
                        <Icons.Trash />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
        <Pagination {...paged} total={filtered.length} noun="documents" onChange={paged.setPage} />
      </Panel>

      {editTarget && (
        <Modal
          title="Rename Document"
          subtitle={<>The extension <span className="text-[#A9C97C]">{editTarget.extension || "(none)"}</span> stays the same.</>}
          onClose={() => setEditTarget(null)}
          busy={busy}
          footer={
            <>
              <SecondaryButton onClick={() => setEditTarget(null)} disabled={busy}>Cancel</SecondaryButton>
              <PrimaryButton onClick={() => void rename()} disabled={busy} icon={<Icons.Check />}>{busy ? "Saving…" : "Save"}</PrimaryButton>
            </>
          }
        >
          <TextField label="File name" value={editName} onChange={setEditName} required autoFocus maxLength={150} />
        </Modal>
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Document?"
          message={<>Delete <span className="font-medium text-[#A9C97C]">{deleteTarget.filename}</span>? The AI assistant will no longer use it to answer questions.</>}
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
