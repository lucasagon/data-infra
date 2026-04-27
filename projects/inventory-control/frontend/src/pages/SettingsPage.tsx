import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { api } from "../lib/api";

type FolderType = "physical_location" | "logical_group" | "mixed";

type FolderTypeTemplate = {
  id: string;
  key: string;
  label: string;
  description?: string;
  baseType: FolderType;
  isSystem: boolean;
};

const baseTypeOptions: Array<{ value: FolderType; label: string }> = [
  { value: "physical_location", label: "Local físico" },
  { value: "logical_group", label: "Agrupamento lógico" },
  { value: "mixed", label: "Misto" },
];

export function SettingsPage() {
  const [folderTypes, setFolderTypes] = useState<FolderTypeTemplate[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    key: "",
    label: "",
    description: "",
    baseType: "mixed" as FolderType,
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  async function loadFolderTypes() {
    const response = await api.get("/v1/settings/folder-types");
    setFolderTypes(response.data);
  }

  useEffect(() => {
    loadFolderTypes().catch(() => setErrorMessage("Não foi possível carregar os tipos de pasta."));
  }, []);

  function generateKeyFromLabel(label: string): string {
    return label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const formData = {
        ...form,
        key: generateKeyFromLabel(form.label),
      };

      if (editingId) {
        await api.patch(`/v1/settings/folder-types/${editingId}`, formData);
        setStatusMessage("Tipo de pasta atualizado com sucesso.");
      } else {
        await api.post("/v1/settings/folder-types", formData);
        setStatusMessage("Tipo de pasta cadastrado com sucesso.");
      }

      await loadFolderTypes();
      setForm({
        key: "",
        label: "",
        description: "",
        baseType: "mixed",
      });
      setEditingId(null);
    } catch {
      setErrorMessage("Não foi possível salvar o tipo de pasta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Tem certeza que deseja excluir este tipo de pasta? Esta ação é irreversível.");
    if (!confirmed) return;

    try {
      await api.delete(`/v1/settings/folder-types/${id}`);
      await loadFolderTypes();
      setStatusMessage("Tipo de pasta excluído com sucesso.");
    } catch {
      setErrorMessage("Não foi possível excluir o tipo de pasta.");
    }
  }

  function handleEdit(folderType: FolderTypeTemplate) {
    setForm({
      key: folderType.key,
      label: folderType.label,
      description: folderType.description || "",
      baseType: folderType.baseType,
    });
    setEditingId(folderType.id);
  }

  function handleCancel() {
    setForm({
      key: "",
      label: "",
      description: "",
      baseType: "mixed",
    });
    setEditingId(null);
  }

  return (
    <AppShell>
      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.25)]">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Configuração do sistema</p>
          <h2 className="mt-2 text-2xl font-semibold">Tipos de pasta</h2>
          <p className="mt-2 text-sm text-slate-500">
            Cadastre tipos de pasta customizados para serem usados no explorer.
          </p>

          {statusMessage ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{statusMessage}</div>
          ) : null}
          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Nome de exibição</span>
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="ex: Depósito obra"
                required
                value={form.label}
              />
              <p className="mt-1 text-xs text-slate-400">A chave será gerada automaticamente</p>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Categoria</span>
              <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setForm((current) => ({ ...current, baseType: event.target.value as FolderType }))} value={form.baseType}>
                {baseTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Descrição</span>
              <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} value={form.description} />
            </label>

            <div className="flex justify-end gap-2">
              {editingId && (
                <button
                  className="rounded-full border border-slate-200 px-5 py-2 text-sm font-medium hover:bg-slate-50"
                  onClick={handleCancel}
                  type="button"
                >
                  Cancelar
                </button>
              )}
              <button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white" disabled={submitting} type="submit">
                {submitting ? "Salvando..." : editingId ? "Atualizar tipo" : "Cadastrar tipo"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.25)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Catálogo</p>
              <h3 className="mt-2 text-2xl font-semibold">Tipos cadastrados</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">{folderTypes.length} tipos</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {folderTypes.map((folderType) => (
              <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5" key={folderType.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold">{folderType.label}</h4>
                    <p className="mt-1 text-xs text-slate-500">{folderType.key}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">{folderType.baseType}</span>
                </div>

                {folderType.description ? <p className="mt-3 text-sm text-slate-600">{folderType.description}</p> : null}

                {folderType.isSystem ? <p className="mt-4 text-xs font-medium text-[var(--brand-primary-strong)]">Tipo nativo do sistema</p> : null}

                {!folderType.isSystem && (
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-100"
                      onClick={() => handleEdit(folderType)}
                      type="button"
                    >
                      Editar
                    </button>
                    <button
                      className="rounded-full border border-rose-200 px-3 py-1 text-xs text-rose-600 hover:bg-rose-50"
                      onClick={() => handleDelete(folderType.id)}
                      type="button"
                    >
                      Deletar
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
