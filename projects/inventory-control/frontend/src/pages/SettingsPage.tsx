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
  colorHex: string;
  isSystem: boolean;
};

const baseTypeOptions: Array<{ value: FolderType; label: string }> = [
  { value: "physical_location", label: "Local físico" },
  { value: "logical_group", label: "Agrupamento lógico" },
  { value: "mixed", label: "Misto" },
];

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <h3 className="text-xl font-semibold">{title}</h3>
          <button className="rounded-full border border-slate-200 px-3 py-1 text-sm" onClick={onClose} type="button">
            Fechar
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [folderTypes, setFolderTypes] = useState<FolderTypeTemplate[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    label: "",
    description: "",
    baseType: "mixed" as FolderType,
    colorHex: "#f59e0b",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);

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
      const generatedKey = generateKeyFromLabel(form.label);
      if (generatedKey.length < 2) {
        setErrorMessage("Nome inválido para gerar chave técnica. Use pelo menos 2 letras ou números.");
        return;
      }

      const payload = {
        key: generatedKey,
        label: form.label,
        description: form.description,
        baseType: form.baseType,
        colorHex: form.colorHex,
      };

      if (editingId) {
        await api.patch(`/v1/settings/folder-types/${editingId}`, payload);
        setStatusMessage("Tipo de pasta atualizado com sucesso.");
      } else {
        await api.post("/v1/settings/folder-types", payload);
        setStatusMessage("Tipo de pasta cadastrado com sucesso.");
      }

      await loadFolderTypes();
      setForm({ label: "", description: "", baseType: "mixed", colorHex: "#f59e0b" });
      setEditingId(null);
      setFormModalOpen(false);
    } catch (error) {
      const apiError = error as {
        response?: {
          data?: {
            error?: {
              code?: string;
              message?: string;
            };
          };
        };
      };
      const backendCodeOrMessage =
        apiError.response?.data?.error?.code ??
        apiError.response?.data?.error?.message ??
        "";

      if (
        backendCodeOrMessage.includes("Unique constraint failed") ||
        backendCodeOrMessage.includes("P2002") ||
        backendCodeOrMessage.includes("FOLDER_TYPE_TEMPLATE_KEY_ALREADY_EXISTS")
      ) {
        setErrorMessage("Já existe um tipo de pasta com esse nome/chave técnica.");
      } else if (
        backendCodeOrMessage.includes("\"code\": \"invalid_string\"") &&
        backendCodeOrMessage.includes("\"colorHex\"")
      ) {
        setErrorMessage("A cor precisa estar no formato hexadecimal válido (ex.: #22c55e).");
      } else if (
        backendCodeOrMessage.includes("\"code\": \"too_small\"") &&
        (backendCodeOrMessage.includes("\"key\"") || backendCodeOrMessage.includes("\"label\""))
      ) {
        setErrorMessage("Preencha os campos obrigatórios com valores válidos.");
      } else {
        setErrorMessage("Não foi possível salvar o tipo de pasta. Verifique nome, cor e duplicidade.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(folderType: FolderTypeTemplate) {
    const confirmed = window.confirm(`Tem certeza que deseja excluir o tipo "${folderType.label}"? Esta ação é irreversível.`);
    if (!confirmed) return;

    try {
      await api.delete(`/v1/settings/folder-types/${folderType.id}`);
      await loadFolderTypes();
      setStatusMessage("Tipo de pasta excluído com sucesso.");
    } catch {
      setErrorMessage("Não foi possível excluir o tipo de pasta.");
    }
  }

  function handleEdit(folderType: FolderTypeTemplate) {
    setForm({
      label: folderType.label,
      description: folderType.description || "",
      baseType: folderType.baseType,
      colorHex: folderType.colorHex || "#f59e0b",
    });
    setEditingId(folderType.id);
    setFormModalOpen(true);
  }

  function handleCancel() {
    setForm({ label: "", description: "", baseType: "mixed", colorHex: "#f59e0b" });
    setEditingId(null);
    setFormModalOpen(false);
  }

  return (
    <AppShell>
      <div className="space-y-4">
        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{statusMessage}</div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
        ) : null}
      </div>

      <div className="mt-6">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.25)]">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-xl font-semibold">Tipos cadastrados</h3>
            <button
              className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white"
              onClick={() => {
                setEditingId(null);
                setForm({ label: "", description: "", baseType: "mixed", colorHex: "#f59e0b" });
                setFormModalOpen(true);
              }}
              type="button"
            >
              Cadastrar Tipo
            </button>
          </div>
          <div className="mt-6 space-y-3">
            {folderTypes.map((folderType) => (
              <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4" key={folderType.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full border border-slate-300" style={{ backgroundColor: folderType.colorHex }} />
                      <h4 className="font-semibold">{folderType.label}</h4>
                    </div>
                    {folderType.description ? <p className="mt-2 text-sm text-slate-600">{folderType.description}</p> : null}
                  </div>
                  {!folderType.isSystem ? (
                    <div className="flex gap-2">
                      <button className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-100" onClick={() => handleEdit(folderType)} type="button">
                        Editar
                      </button>
                      <button className="rounded-full border border-rose-200 px-3 py-1 text-xs text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(folderType)} type="button">
                        Excluir
                      </button>
                    </div>
                  ) : (
                    <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">Sistema</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      {formModalOpen ? (
        <Modal onClose={handleCancel} title={editingId ? "Editar tipo de pasta" : "Cadastrar tipo de pasta"}>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Nome do tipo</span>
              <input
                className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                required
                value={form.label}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Categoria operacional</span>
              <select
                className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, baseType: event.target.value as FolderType }))}
                value={form.baseType}
              >
                {baseTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Cor do tipo</span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 px-2 py-2"
                onChange={(event) => setForm((current) => ({ ...current, colorHex: event.target.value }))}
                type="color"
                value={form.colorHex}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Descrição</span>
              <textarea
                className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                value={form.description}
              />
            </label>

            <div className="flex justify-end gap-2">
              <button className="rounded-full border border-slate-200 px-5 py-2 text-sm" onClick={handleCancel} type="button">
                Cancelar
              </button>
              <button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white" disabled={submitting} type="submit">
                {submitting ? "Salvando..." : editingId ? "Atualizar tipo" : "Cadastrar tipo"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </AppShell>
  );
}
