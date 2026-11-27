import { useState } from "react";
import { api, errorText } from "./api";
import { useNotify } from "./hooks";
import { Modal, PrimaryButton, SecondaryButton } from "./ui";
import { Icons } from "./icons";

const SAMPLE_CSV = `kind,name_english,name_sanskrit,botanical_name,family,aliases,name,form,ingredients,source_ids
herb,Ashwagandha,Ashwagandha,Withania somnifera,Solanaceae,Indian ginseng;Winter cherry,,,,
medicine,,,,,,Triphala churna,churna,Amalaki;Haritaki;Bibhitaki,AYU-009`;

export default function ImportCatalogModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const notify = useNotify();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ayurvedai-catalog-import-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    if (!file) return setError("Please choose a .csv or .json file.");
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await api<{ message: string }>("/catalog/import", { method: "POST", body: form });
      notify("success", data.message);
      onImported();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title="Import Herbs & Medicines"
      subtitle="Bulk-add or update catalog records from a CSV or JSON file. Imported records are saved as draft."
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => void submit()} disabled={busy || !file} icon={<Icons.Upload />}>{busy ? "Importing…" : "Import"}</PrimaryButton>
        </>
      }
    >
      <div className="space-y-4 text-sm text-[#B7C4A9]">
        <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-[#A6B399]">
          <li>Every row needs a <code className="text-[#D5E6C0]">kind</code> column: <code className="text-[#D5E6C0]">herb</code> or <code className="text-[#D5E6C0]">medicine</code>.</li>
          <li>Herbs use <code className="text-[#D5E6C0]">name_english</code>; medicines use <code className="text-[#D5E6C0]">name</code>, <code className="text-[#D5E6C0]">form</code> and at least one <code className="text-[#D5E6C0]">source_ids</code> value.</li>
          <li>Separate list values (aliases, ingredients, sources) with semicolons. Existing records with the same name are updated.</li>
        </ul>
        <button type="button" onClick={downloadSample} className="inline-flex items-center gap-2 text-xs text-[#A9C97C] underline-offset-2 hover:underline">
          <Icons.Download /> Download sample CSV
        </button>
        <div>
          <label htmlFor="catalog-import-file" className="mb-1.5 block text-xs uppercase tracking-wider text-[#8FA080]">
            File<span className="ml-0.5 text-[#E8967A]">*</span>
          </label>
          <input
            id="catalog-import-file"
            type="file"
            accept=".csv,.json"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#A6B399] file:mr-3 file:rounded-lg file:border-0 file:bg-[#8FAF5A]/20 file:px-3 file:py-1 file:text-[#D5E6C0]"
          />
        </div>
        {error && <p role="alert" className="rounded-lg border border-[#E8967A]/25 bg-[#E8967A]/10 px-3 py-2 text-sm text-[#F0B5A2]">{error}</p>}
      </div>
    </Modal>
  );
}
