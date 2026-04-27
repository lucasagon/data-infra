import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../components/AppShell";
import { api } from "../lib/api";

type FolderType = "physical_location" | "logical_group" | "mixed";
type ItemType = "stock" | "asset";
type ViewMode = "list" | "grid";
type DialogMode =
  | "new-folder"
  | "edit-folder"
  | "move-folder"
  | "new-item"
  | "edit-item"
  | "move-item"
  | "stock-out"
  | null;

type FolderSummary = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  folderType: FolderType;
  folderTypeTemplateId?: string | null;
  folderTypeLabel?: string;
  description?: string;
  directItems: number;
  totalValue: number;
};

type FolderTypeTemplate = {
  id: string;
  key: string;
  label: string;
  description?: string;
  baseType: FolderType;
  isSystem: boolean;
};

type ItemSummary = {
  id: string;
  folderId: string;
  name: string;
  type: ItemType;
  currentQuantity: number;
  minStock: number;
  unitPrice: number | string;
  totalValue: number;
  internalCode: string;
  description?: string;
  barcode?: string;
  notes?: string;
};

type ContextMenuState =
  | {
      x: number;
      y: number;
      entityType: "folder" | "item";
      entityId: string;
    }
  | null;

type SearchResult = {
  entityType: "folder" | "item";
  id: string;
  title: string;
  subtitle: string;
};

type DragEntity = {
  entityType: "folder" | "item";
  id: string;
};

function createFolderForm(parentId: string | null, folder?: FolderSummary) {
  return {
    parentId,
    name: folder?.name ?? "",
    description: folder?.description ?? "",
    folderType: folder?.folderType ?? ("mixed" as FolderType),
    folderTypeTemplateId: folder?.folderTypeTemplateId ?? "",
  };
}

function createItemForm(folderId: string | null, item?: ItemSummary) {
  return {
    folderId: item?.folderId ?? folderId ?? "",
    type: item?.type ?? ("stock" as ItemType),
    name: item?.name ?? "",
    description: item?.description ?? "",
    internalCode: item?.internalCode ?? `SKU-${Date.now()}`,
    barcode: item?.barcode ?? "",
    minStock: item?.minStock ?? 0,
    currentQuantity: item ? Number(item.currentQuantity) : 0,
    unitPrice: item ? Number(item.unitPrice) : 0,
    notes: item?.notes ?? "",
  };
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="text-xl font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>

          <button className="rounded-full border border-slate-200 px-3 py-1 text-sm" onClick={onClose} type="button">
            Fechar
          </button>
        </div>

        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function FolderIcon({ className = "h-4 w-4 text-amber-500" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M3 6.75A2.25 2.25 0 0 1 5.25 4.5H9c.597 0 1.169.237 1.591.659L12 6.57c.422.422.994.659 1.591.659h5.159A2.25 2.25 0 0 1 21 9.479v7.771a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 17.25V6.75Z"
        fill="currentColor"
      />
      <path d="M3.75 9h16.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
    </svg>
  );
}

function FileIcon({ className = "h-4 w-4 text-sky-600" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M6.75 3.75h7.318a2.25 2.25 0 0 1 1.591.659l2.932 2.932a2.25 2.25 0 0 1 .659 1.591V19.5a2.25 2.25 0 0 1-2.25 2.25h-10.5a2.25 2.25 0 0 1-2.25-2.25V6a2.25 2.25 0 0 1 2.25-2.25Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path d="M14.25 3.75V8.25h4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      <path d="M8.25 12h7.5M8.25 15.75h7.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function normalizeForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function FolderTreeNode({
  folder,
  selectedFolderId,
  expandedIds,
  childrenByParent,
  dragOverFolderId,
  onSelect,
  onToggle,
  onContextMenu,
  onDragOverFolder,
  onDropEntityOnFolder,
  onClearDragOverFolder,
  depth = 0,
}: {
  folder: FolderSummary;
  selectedFolderId: string | null;
  expandedIds: Set<string>;
  childrenByParent: Map<string | null, FolderSummary[]>;
  dragOverFolderId: string | null;
  onSelect: (folderId: string) => void;
  onToggle: (folderId: string) => void;
  onContextMenu: (event: React.MouseEvent, entityType: "folder" | "item", entityId: string) => void;
  onDragOverFolder: (folderId: string) => void;
  onDropEntityOnFolder: (folderId: string) => void;
  onClearDragOverFolder: () => void;
  depth?: number;
}) {
  const children = childrenByParent.get(folder.id) ?? [];
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = selectedFolderId === folder.id;
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-2 rounded-xl px-2 py-1 text-sm ${
          dragOverFolderId === folder.id
            ? "bg-[var(--brand-primary-soft)] text-slate-900 ring-1 ring-[var(--brand-primary)]"
            : isSelected
              ? "bg-[var(--brand-primary-soft)] text-slate-900"
              : "text-slate-700 hover:bg-slate-100"
        }`}
        onContextMenu={(event) => onContextMenu(event, "folder", folder.id)}
        onDragLeave={onClearDragOverFolder}
        onDragOver={(event) => {
          event.preventDefault();
          onDragOverFolder(folder.id);
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDropEntityOnFolder(folder.id);
        }}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <button
          className="flex h-5 w-5 items-center justify-center rounded border border-slate-200 bg-white text-[10px] text-slate-500"
          disabled={!hasChildren}
          onClick={() => hasChildren && onToggle(folder.id)}
          type="button"
        >
          {hasChildren ? (isExpanded ? "-" : "+") : ""}
        </button>

        <button
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onSelect(folder.id)}
          onDoubleClick={() => onSelect(folder.id)}
          type="button"
        >
          <FolderIcon className="h-4 w-4 text-amber-500" />
          <span className="truncate">{folder.name}</span>
        </button>
      </div>

      {hasChildren && isExpanded ? (
        <div className="mt-1 space-y-1">
          {children.map((child) => (
            <FolderTreeNode
              childrenByParent={childrenByParent}
              dragOverFolderId={dragOverFolderId}
              depth={depth + 1}
              expandedIds={expandedIds}
              folder={child}
              key={child.id}
              onClearDragOverFolder={onClearDragOverFolder}
              onContextMenu={onContextMenu}
              onDragOverFolder={onDragOverFolder}
              onDropEntityOnFolder={onDropEntityOnFolder}
              onSelect={onSelect}
              onToggle={onToggle}
              selectedFolderId={selectedFolderId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ExplorerPage() {
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [folderTypeTemplates, setFolderTypeTemplates] = useState<FolderTypeTemplate[]>([]);
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [allItems, setAllItems] = useState<ItemSummary[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [lastClickedItemId, setLastClickedItemId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [folderForm, setFolderForm] = useState(createFolderForm(null));
  const [moveParentId, setMoveParentId] = useState("ROOT");
  const [itemForm, setItemForm] = useState(createItemForm(null));
  const [moveItemFolderId, setMoveItemFolderId] = useState("");
  const [stockOutForm, setStockOutForm] = useState({
    itemId: "",
    quantity: 1,
    reason: "",
    notes: "",
  });
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const optionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState<string | null>(null);
  const [draggedEntity, setDraggedEntity] = useState<DragEntity | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverContentFolderId, setDragOverContentFolderId] = useState<string | null>(null);

  const folderMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const selectedFolder = useMemo(
    () => (selectedFolderId ? folderMap.get(selectedFolderId) ?? null : null),
    [folderMap, selectedFolderId],
  );
  const selectedItem = useMemo(
    () => (selectedItemId ? items.find((item) => item.id === selectedItemId) ?? null : null),
    [items, selectedItemId],
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, FolderSummary[]>();

    folders.forEach((folder) => {
      const list = map.get(folder.parentId) ?? [];
      list.push(folder);
      map.set(folder.parentId, list);
    });

    for (const [, list] of map.entries()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return map;
  }, [folders]);

  const childFolders = useMemo(
    () => (selectedFolderId ? childrenByParent.get(selectedFolderId) ?? [] : childrenByParent.get(null) ?? []),
    [childrenByParent, selectedFolderId],
  );

  const breadcrumb = useMemo(() => {
    const trail: FolderSummary[] = [];
    let currentId = selectedFolderId;

    while (currentId) {
      const currentFolder = folderMap.get(currentId);

      if (!currentFolder) {
        break;
      }

      trail.unshift(currentFolder);
      currentId = currentFolder.parentId;
    }

    return trail;
  }, [folderMap, selectedFolderId]);

  const folderPathById = useMemo(() => {
    const map = new Map<string, string>();
    folders.forEach((folder) => {
      const chain: string[] = [];
      let current: FolderSummary | undefined = folder;
      while (current) {
        chain.unshift(current.name);
        current = current.parentId ? folderMap.get(current.parentId) : undefined;
      }
      map.set(folder.id, `Inicio > ${chain.join(" > ")}`);
    });
    return map;
  }, [folderMap, folders]);

  const searchResults = useMemo(() => {
    const term = normalizeForSearch(submittedSearchQuery ?? "");
    if (!term) {
      return [] as SearchResult[];
    }

    const folderMatches: SearchResult[] = folders
      .filter((folder) => normalizeForSearch(folder.name).includes(term))
      .map((folder) => ({
        entityType: "folder",
        id: folder.id,
        title: folder.name,
        subtitle: folderPathById.get(folder.id) ?? "Inicio",
      }));

    const itemMatches: SearchResult[] = allItems
      .filter(
        (item) =>
          normalizeForSearch(item.name).includes(term) ||
          normalizeForSearch(item.internalCode).includes(term) ||
          normalizeForSearch(item.description ?? "").includes(term),
      )
      .map((item) => ({
        entityType: "item",
        id: item.id,
        title: item.name,
        subtitle: `${folderPathById.get(item.folderId) ?? "Inicio"} > ${item.internalCode}`,
      }));

    return [...folderMatches, ...itemMatches].sort((a, b) => a.title.localeCompare(b.title));
  }, [allItems, folderPathById, folders, submittedSearchQuery]);

  const searchSuggestions = useMemo(() => {
    const term = normalizeForSearch(searchQuery);
    if (!term) {
      return [] as SearchResult[];
    }

    const folderMatches: SearchResult[] = folders
      .filter((folder) => normalizeForSearch(folder.name).includes(term))
      .slice(0, 5)
      .map((folder) => ({
        entityType: "folder",
        id: folder.id,
        title: folder.name,
        subtitle: folderPathById.get(folder.id) ?? "Inicio",
      }));

    const itemMatches: SearchResult[] = allItems
      .filter(
        (item) =>
          normalizeForSearch(item.name).includes(term) ||
          normalizeForSearch(item.internalCode).includes(term) ||
          normalizeForSearch(item.description ?? "").includes(term),
      )
      .slice(0, 5)
      .map((item) => ({
        entityType: "item",
        id: item.id,
        title: item.name,
        subtitle: `${folderPathById.get(item.folderId) ?? "Inicio"} > ${item.internalCode}`,
      }));

    return [...folderMatches, ...itemMatches].slice(0, 8);
  }, [allItems, folderPathById, folders, searchQuery]);

  const moveFolderOptions = useMemo(() => {
    if (!selectedFolderId) {
      return folders;
    }

    const disallowed = new Set<string>([selectedFolderId]);
    const stack = [...(childrenByParent.get(selectedFolderId) ?? [])];

    while (stack.length > 0) {
      const current = stack.pop();

      if (!current) {
        continue;
      }

      disallowed.add(current.id);
      stack.push(...(childrenByParent.get(current.id) ?? []));
    }

    return folders.filter((folder) => !disallowed.has(folder.id));
  }, [childrenByParent, folders, selectedFolderId]);

  const moveItemOptions = useMemo(
    () => folders.filter((folder) => folder.id !== selectedItem?.folderId),
    [folders, selectedItem?.folderId],
  );

  useEffect(() => {
    loadFolders().catch(() => setErrorMessage("Nao foi possivel carregar a estrutura de pastas."));
    loadAllItems().catch(() => undefined);
    api.get("/v1/settings/folder-types").then((response) => setFolderTypeTemplates(response.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadItems(selectedFolderId).catch(() => setErrorMessage("Nao foi possivel carregar os itens da pasta."));
  }, [selectedFolderId]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [contextMenu]);

  useEffect(() => {
    if (!optionsMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
        setOptionsMenuOpen(false);
      }
    };

    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [optionsMenuOpen]);

  async function loadFolders(preferredFolderId?: string | null) {
    const response = await api.get("/v1/folders");
    const nextFolders: FolderSummary[] = response.data;
    setFolders(nextFolders);

    const nextSelected =
      (preferredFolderId && nextFolders.some((folder) => folder.id === preferredFolderId) ? preferredFolderId : null) ??
      (selectedFolderId && nextFolders.some((folder) => folder.id === selectedFolderId) ? selectedFolderId : null) ??
      nextFolders[0]?.id ??
      null;

    setSelectedFolderId(nextSelected);

    if (nextSelected) {
      const nextExpanded = new Set(expandedIds);
      let currentId: string | null = nextSelected;

      while (currentId) {
        nextExpanded.add(currentId);
        currentId = nextFolders.find((folder) => folder.id === currentId)?.parentId ?? null;
      }

      setExpandedIds(nextExpanded);
    }
  }

  async function loadItems(folderId: string | null) {
    if (!folderId) {
      setItems([]);
      setSelectedItemId(null);
      return;
    }

    const response = await api.get(`/v1/items?folderId=${folderId}`);
    setItems(response.data);

    if (selectedItemId && !response.data.some((item: ItemSummary) => item.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }

  async function loadAllItems() {
    const response = await api.get("/v1/items");
    setAllItems(response.data);
  }

  function setMessage(status?: string, error?: string) {
    setStatusMessage(status ?? null);
    setErrorMessage(error ?? null);
  }

  function toggleFolder(folderId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  function selectFolder(folderId: string) {
    setSelectedFolderId(folderId);
    setSelectedItemId(null);
    setSelectedItemIds(new Set());
    setLastClickedItemId(null);
    setExpandedIds((current) => new Set(current).add(folderId));
  }

  function handleItemClick(itemId: string, event: React.MouseEvent) {
    if (event.ctrlKey || event.metaKey) {
      setSelectedItemIds((current) => {
        const next = new Set(current);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
      setLastClickedItemId(itemId);
      setSelectedItemId(itemId);
    } else if (event.shiftKey && lastClickedItemId) {
      const lastIndex = items.findIndex((item) => item.id === lastClickedItemId);
      const currentIndex = items.findIndex((item) => item.id === itemId);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const newSelection = new Set<string>();

        for (let i = start; i <= end; i++) {
          newSelection.add(items[i].id);
        }

        setSelectedItemIds(newSelection);
        setSelectedItemId(itemId);
      }
    } else {
      setSelectedItemIds(new Set([itemId]));
      setSelectedItemId(itemId);
      setLastClickedItemId(itemId);
    }
  }

  function handleDragStart(entityType: "folder" | "item", id: string) {
    setDraggedEntity({ entityType, id });
    setDragOverFolderId(null);
    setDragOverContentFolderId(null);
  }

  function clearDragState() {
    setDraggedEntity(null);
    setDragOverFolderId(null);
    setDragOverContentFolderId(null);
  }

  function handleContentFolderDragOver(event: React.DragEvent, folderId: string) {
    if (draggedEntity?.entityType !== "item") {
      return;
    }
    event.preventDefault();
    setDragOverContentFolderId(folderId);
  }

  function handleContentFolderDrop(event: React.DragEvent, folderId: string) {
    if (draggedEntity?.entityType !== "item") {
      return;
    }
    event.preventDefault();
    void dropEntityOnFolder(folderId);
  }

  async function dropEntityOnFolder(targetFolderId: string) {
    if (!draggedEntity) {
      return;
    }

    setDragOverFolderId(null);
    setDragOverContentFolderId(null);
    setMessage();

    try {
      if (draggedEntity.entityType === "folder") {
        if (draggedEntity.id === targetFolderId) {
          clearDragState();
          return;
        }

        await api.post(`/v1/folders/${draggedEntity.id}/move`, {
          parentId: targetFolderId,
        });

        await loadFolders(selectedFolderId);
        await loadItems(selectedFolderId);
        await loadAllItems();
        setMessage("Pasta movida com sucesso.");
      } else {
        const sourceItem = allItems.find((item) => item.id === draggedEntity.id);
        if (!sourceItem || sourceItem.folderId === targetFolderId) {
          clearDragState();
          return;
        }

        await api.post(`/v1/items/${draggedEntity.id}/transfer`, {
          destinationFolderId: targetFolderId,
          reason: "Reorganizacao de estrutura",
          notes: "Movimentado pelo explorer (arrastar e soltar)",
        });

        await loadItems(selectedFolderId);
        await loadFolders(selectedFolderId);
        await loadAllItems();
        setMessage("Item movido com sucesso.");
      }
    } catch {
      setMessage(undefined, "Nao foi possivel concluir a movimentacao por arrastar e soltar.");
    } finally {
      clearDragState();
    }
  }

  function openSearchResult(result: SearchResult) {
    if (result.entityType === "folder") {
      selectFolder(result.id);
      setSubmittedSearchQuery(null);
      setSearchQuery("");
      return;
    }

    const item = allItems.find((entry) => entry.id === result.id);
    if (!item) {
      return;
    }

    selectFolder(item.folderId);
    setSelectedItemId(item.id);
    setSubmittedSearchQuery(null);
    setSearchQuery("");
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = searchQuery.trim();
    setSubmittedSearchQuery(nextQuery || null);
    setOptionsMenuOpen(false);
  }

  function handleContextMenu(event: React.MouseEvent, entityType: "folder" | "item", entityId: string) {
    event.preventDefault();
    if (entityType === "folder") {
      setSelectedFolderId(entityId);
    } else {
      if (!event.ctrlKey && !event.metaKey) {
        setSelectedItemIds(new Set([entityId]));
        setSelectedItemId(entityId);
        setLastClickedItemId(entityId);
      }
    }

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      entityType,
      entityId,
    });
  }

  function openNewFolderModal(parentId: string | null) {
    setFolderForm(createFolderForm(parentId));
    setDialogMode("new-folder");
    setContextMenu(null);
  }

  function openEditFolderModal(folder: FolderSummary) {
    setFolderForm(createFolderForm(folder.parentId, folder));
    setDialogMode("edit-folder");
    setContextMenu(null);
  }

  function openMoveFolderModal(folder: FolderSummary) {
    setSelectedFolderId(folder.id);
    setMoveParentId(folder.parentId ?? "ROOT");
    setDialogMode("move-folder");
    setContextMenu(null);
  }

  function openNewItemModal(folderId: string | null) {
    setItemForm(createItemForm(folderId));
    setDialogMode("new-item");
    setContextMenu(null);
  }

  function openEditItemModal(item: ItemSummary) {
    setItemForm(createItemForm(item.folderId, item));
    setSelectedItemId(item.id);
    setDialogMode("edit-item");
    setContextMenu(null);
  }

  function openMoveItemModal(item: ItemSummary) {
    setSelectedItemId(item.id);
    setMoveItemFolderId(item.folderId);
    setDialogMode("move-item");
    setContextMenu(null);
  }

  function openStockOutModal(item: ItemSummary) {
    setSelectedItemId(item.id);
    setStockOutForm({
      itemId: item.id,
      quantity: 1,
      reason: "",
      notes: "",
    });
    setDialogMode("stock-out");
    setContextMenu(null);
  }

  async function handleCreateFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage();

    try {
      const response = await api.post("/v1/folders", {
        ...folderForm,
        folderTypeTemplateId: folderForm.folderTypeTemplateId || null,
      });
      await loadFolders(response.data.id);
      setDialogMode(null);
      setMessage(`Pasta "${response.data.name}" criada com sucesso.`);
    } catch {
      setMessage(undefined, "Nao foi possivel criar a pasta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFolderId) {
      return;
    }

    setSubmitting(true);
    setMessage();

    try {
      const response = await api.patch(`/v1/folders/${selectedFolderId}`, {
        ...folderForm,
        folderTypeTemplateId: folderForm.folderTypeTemplateId || null,
      });
      await loadFolders(response.data.id);
      setDialogMode(null);
      setMessage(`Pasta "${response.data.name}" atualizada com sucesso.`);
    } catch {
      setMessage(undefined, "Nao foi possivel atualizar a pasta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMoveFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFolderId) {
      return;
    }

    setSubmitting(true);
    setMessage();

    try {
      await api.post(`/v1/folders/${selectedFolderId}/move`, {
        parentId: moveParentId === "ROOT" ? null : moveParentId,
      });
      await loadFolders(selectedFolderId);
      setDialogMode(null);
      setMessage("Pasta movida com sucesso.");
    } catch {
      setMessage(undefined, "Nao foi possivel mover a pasta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage();

    try {
      const response = await api.post("/v1/items", {
        ...itemForm,
        minStock: Number(itemForm.minStock),
        currentQuantity: Number(itemForm.currentQuantity),
        unitPrice: Number(itemForm.unitPrice),
      });
      await loadItems(itemForm.folderId);
      await loadFolders(itemForm.folderId);
      await loadAllItems();
      setSelectedFolderId(itemForm.folderId);
      setSelectedItemId(response.data.id);
      setDialogMode(null);
      setMessage(`Item "${itemForm.name}" criado com sucesso.`);
    } catch {
      setMessage(undefined, "Nao foi possivel criar o item.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItemId) {
      return;
    }

    setSubmitting(true);
    setMessage();

    try {
      await api.patch(`/v1/items/${selectedItemId}`, {
        ...itemForm,
        minStock: Number(itemForm.minStock),
        currentQuantity: Number(itemForm.currentQuantity),
        unitPrice: Number(itemForm.unitPrice),
      });
      await loadItems(itemForm.folderId);
      await loadFolders(itemForm.folderId);
      await loadAllItems();
      setSelectedFolderId(itemForm.folderId);
      setDialogMode(null);
      setMessage(`Item "${itemForm.name}" atualizado com sucesso.`);
    } catch {
      setMessage(undefined, "Nao foi possivel atualizar o item.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMoveItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItemId) {
      return;
    }

    setSubmitting(true);
    setMessage();

    try {
      await api.post(`/v1/items/${selectedItemId}/transfer`, {
        destinationFolderId: moveItemFolderId,
        reason: "Reorganizacao de estrutura",
        notes: "Movimentado pelo explorer",
      });
      await loadItems(selectedFolderId);
      await loadFolders(moveItemFolderId);
      await loadAllItems();
      setDialogMode(null);
      setMessage("Item movido com sucesso.");
    } catch {
      setMessage(undefined, "Nao foi possivel mover o item.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStockOut(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage();

    try {
      await api.post(`/v1/items/${stockOutForm.itemId}/stock-out`, {
        quantity: Number(stockOutForm.quantity),
        reason: stockOutForm.reason,
        notes: stockOutForm.notes,
      });
      await loadItems(selectedFolderId);
      await loadFolders(selectedFolderId);
      await loadAllItems();
      setDialogMode(null);
      setMessage("Saida de estoque registrada com sucesso.");
    } catch {
      setMessage(undefined, "Nao foi possivel registrar a saida de estoque.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteFolder(folderId: string) {
    const folder = folderMap.get(folderId);
    if (!folder) {
      return;
    }

    const confirmed = window.confirm(
      `Tem certeza que deseja excluir a pasta "${folder.name}"? Essa acao e irreversivel.`,
    );
    setContextMenu(null);

    if (!confirmed) {
      return;
    }

    setMessage();

    try {
      await api.post(`/v1/folders/${folderId}/inactivate`);
      const preferredFolderId = selectedFolderId === folderId ? null : selectedFolderId;
      await loadFolders(preferredFolderId);
      await loadItems(preferredFolderId);
      await loadAllItems();
      setMessage(`Pasta "${folder.name}" excluida com sucesso.`);
    } catch (error) {
      const apiError = error as { response?: { data?: { error?: { code?: string } } } };
      if (apiError.response?.data?.error?.code === "FOLDER_NOT_EMPTY") {
        setMessage(undefined, "Nao foi possivel excluir: a pasta ainda possui subpastas ou itens.");
        return;
      }
      setMessage(undefined, "Nao foi possivel excluir a pasta.");
    }
  }

  const rootFolders = childrenByParent.get(null) ?? [];

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

      <div className="mt-5 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-none border border-slate-200 bg-white p-4 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.35)]">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">N A V E G A Ç Ã O</p>
          </div>

          <div className="rounded-none border border-slate-200 bg-slate-50 p-3">
            <div className="space-y-1">
              {rootFolders.map((folder) => (
                <FolderTreeNode
                  childrenByParent={childrenByParent}
                  dragOverFolderId={dragOverFolderId}
                  expandedIds={expandedIds}
                  folder={folder}
                  key={folder.id}
                  onClearDragOverFolder={() => setDragOverFolderId(null)}
                  onContextMenu={handleContextMenu}
                  onDragOverFolder={setDragOverFolderId}
                  onDropEntityOnFolder={dropEntityOnFolder}
                  onSelect={selectFolder}
                  onToggle={toggleFolder}
                  selectedFolderId={selectedFolderId}
                />
              ))}
            </div>
          </div>
        </aside>

        <section className="space-y-5">
          <article className="rounded-none border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.25)]">
            <form className="relative" onSubmit={handleSearchSubmit}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="h-10 min-w-[220px] flex-1 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[var(--brand-primary)]"
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    if (!event.target.value.trim()) {
                      setSubmittedSearchQuery(null);
                    }
                  }}
                  placeholder="Pesquisar pastas e itens"
                  value={searchQuery}
                />
                <button className="h-10 rounded-md border border-slate-200 px-4 text-sm hover:bg-slate-50" type="submit">
                  Buscar
                </button>
                {submittedSearchQuery ? (
                  <button
                    className="h-10 rounded-md border border-slate-200 px-4 text-sm hover:bg-slate-50"
                    onClick={() => {
                      setSubmittedSearchQuery(null);
                      setSearchQuery("");
                    }}
                    type="button"
                  >
                    Limpar
                  </button>
                ) : null}
              </div>

              {searchQuery.trim() && !submittedSearchQuery ? (
                <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-xl">
                  {searchSuggestions.length > 0 ? (
                    searchSuggestions.map((result) => (
                      <button
                        className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-100"
                        key={`${result.entityType}-${result.id}`}
                        onClick={() => openSearchResult(result)}
                        type="button"
                      >
                        {result.entityType === "folder" ? (
                          <FolderIcon className="mt-0.5 h-4 w-4 text-amber-500" />
                        ) : (
                          <FileIcon className="mt-0.5 h-4 w-4 text-sky-600" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{result.title}</div>
                          <div className="truncate text-xs text-slate-500">{result.subtitle}</div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-2 py-3 text-sm text-slate-500">Nenhuma correspondencia encontrada.</div>
                  )}
                </div>
              ) : null}
            </form>
          </article>

          {submittedSearchQuery ? (
            <article className="rounded-none border border-slate-200 bg-white shadow-[0_20px_50px_-35px_rgba(15,23,42,0.25)]">
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600">
                Resultados para "{submittedSearchQuery}"
              </div>
              <div className="divide-y divide-slate-100">
                {searchResults.length > 0 ? (
                  searchResults.map((result) => (
                    <button
                      className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-slate-50"
                      key={`${result.entityType}-${result.id}`}
                      onClick={() => openSearchResult(result)}
                      type="button"
                    >
                      {result.entityType === "folder" ? (
                        <FolderIcon className="mt-0.5 h-5 w-5 text-amber-500" />
                      ) : (
                        <FileIcon className="mt-0.5 h-5 w-5 text-sky-600" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium">{result.title}</div>
                        <div className="truncate text-xs text-slate-500">{result.subtitle}</div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-5 py-10 text-sm text-slate-500">Nenhum resultado para esta pesquisa.</div>
                )}
              </div>
            </article>
          ) : (
            <article className="rounded-none border border-slate-200 bg-white shadow-[0_20px_50px_-35px_rgba(15,23,42,0.25)]">
              <div className="border-b border-slate-100 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <button className="hover:text-slate-900" onClick={() => setSelectedFolderId(null)} type="button">
                      Inicio
                    </button>
                    {breadcrumb.map((folder) => (
                      <div className="flex items-center gap-2" key={folder.id}>
                        <span className="text-slate-400">{">"}</span>
                        <button className="hover:text-slate-900" onClick={() => selectFolder(folder.id)} type="button">
                          {folder.name}
                        </button>
                      </div>
                    ))}
                  </nav>

                  <div className="flex items-center gap-3">
                    {selectedItemIds.size > 0 && (
                      <div className="rounded-md border border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] px-3 py-2 text-sm text-slate-700">
                        {selectedItemIds.size === 1 ? "1 item selecionado" : `${selectedItemIds.size} itens selecionados`}
                      </div>
                    )}
                    <div className="relative" ref={optionsMenuRef}>
                      <button
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                        onClick={() => setOptionsMenuOpen((current) => !current)}
                        type="button"
                      >
                        Opções
                      </button>

                    {optionsMenuOpen ? (
                      <div className="absolute right-0 top-11 z-30 w-52 border border-slate-200 bg-white p-2 shadow-lg">
                        <div className="px-2 pb-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Visualizacao</div>
                        <button
                          className={`block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100 ${viewMode === "list" ? "text-[var(--brand-primary-strong)]" : ""}`}
                          onClick={() => {
                            setViewMode("list");
                            setOptionsMenuOpen(false);
                          }}
                          type="button"
                        >
                          Lista
                        </button>
                        <button
                          className={`block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100 ${viewMode === "grid" ? "text-[var(--brand-primary-strong)]" : ""}`}
                          onClick={() => {
                            setViewMode("grid");
                            setOptionsMenuOpen(false);
                          }}
                          type="button"
                        >
                          Grade
                        </button>
                        <div className="my-2 border-t border-slate-100" />
                        <div className="px-2 pb-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Acoes</div>
                        <button
                          className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100"
                          onClick={() => {
                            openNewFolderModal(selectedFolderId);
                            setOptionsMenuOpen(false);
                          }}
                          type="button"
                        >
                          Nova pasta
                        </button>
                        <button
                          className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                          disabled={!selectedFolderId}
                          onClick={() => {
                            openNewItemModal(selectedFolderId);
                            setOptionsMenuOpen(false);
                          }}
                          type="button"
                        >
                          Novo item
                        </button>
                      </div>
                    ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {viewMode === "list" ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 bg-white">
                    <tr className="text-left text-slate-500">
                      <th className="px-5 py-3">Nome</th>
                      <th className="px-5 py-3">Tipo</th>
                      <th className="px-5 py-3">Detalhes</th>
                      <th className="px-5 py-3">Valor</th>
                      <th className="px-5 py-3 text-right">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {childFolders.map((folder) => (
                      <tr
                        className={`border-b border-slate-100 hover:bg-slate-50 ${
                          dragOverContentFolderId === folder.id && draggedEntity?.entityType === "item"
                            ? "bg-[var(--brand-primary-soft)]/60"
                            : ""
                        }`}
                        key={folder.id}
                        onContextMenu={(event) => handleContextMenu(event, "folder", folder.id)}
                        onDragLeave={() => setDragOverContentFolderId(null)}
                        onDragOver={(event) => handleContentFolderDragOver(event, folder.id)}
                        onDrop={(event) => handleContentFolderDrop(event, folder.id)}
                        onDoubleClick={() => selectFolder(folder.id)}
                        draggable
                        onDragEnd={clearDragState}
                        onDragStart={() => handleDragStart("folder", folder.id)}
                      >
                        <td className="px-5 py-3">
                          <button className="flex items-center gap-3 text-left" onClick={() => selectFolder(folder.id)} type="button">
                            <FolderIcon className="h-5 w-5 text-amber-500" />
                            <span className="font-medium">{folder.name}</span>
                          </button>
                        </td>
                        <td className="px-5 py-3 text-slate-500">Pasta</td>
                        <td className="px-5 py-3 text-slate-500">
                          {folder.folderTypeLabel ?? folder.folderType} • {folder.directItems} itens
                        </td>
                        <td className="px-5 py-3 text-slate-500">R$ {folder.totalValue.toFixed(2)}</td>
                        <td className="px-5 py-3 text-right">
                          <button className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-100" onClick={() => openEditFolderModal(folder)} type="button">
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}

                    {items.map((item) => (
                      <tr
                        className={`border-b border-slate-100 hover:bg-slate-50 ${selectedItemIds.has(item.id) ? "bg-[var(--brand-primary-soft)]/70" : ""}`}
                        key={item.id}
                        onContextMenu={(event) => handleContextMenu(event, "item", item.id)}
                        onDoubleClick={() => openEditItemModal(item)}
                        onClick={(event) => handleItemClick(item.id, event)}
                        draggable
                        onDragEnd={clearDragState}
                        onDragStart={() => handleDragStart("item", item.id)}
                      >
                        <td className="px-5 py-3">
                          <button className="flex items-center gap-3 text-left" onClick={(e) => { e.stopPropagation(); handleItemClick(item.id, e); }} type="button">
                            <FileIcon className="h-5 w-5 text-sky-600" />
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-xs text-slate-400">{item.internalCode}</div>
                            </div>
                          </button>
                        </td>
                        <td className="px-5 py-3 text-slate-500">{item.type === "asset" ? "Patrimonio" : "Estoque"}</td>
                        <td className="px-5 py-3 text-slate-500">
                          Qtd {item.currentQuantity} • Min {item.minStock}
                        </td>
                        <td className="px-5 py-3 text-slate-500">R$ {Number(item.totalValue).toFixed(2)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-100" onClick={() => openEditItemModal(item)} type="button">
                              Editar
                            </button>
                            <button className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-100" onClick={() => openMoveItemModal(item)} type="button">
                              Mover
                            </button>
                            {item.type === "stock" ? (
                              <button className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-100" onClick={() => openStockOutModal(item)} type="button">
                                Saida
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {childFolders.length === 0 && items.length === 0 ? (
                      <tr>
                        <td className="px-5 py-10 text-center text-sm text-slate-500" colSpan={5}>
                          Esta pasta ainda nao possui subpastas ou itens.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : (
            <div className="p-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {childFolders.map((folder) => (
                  <button
                    className={`rounded-none border bg-slate-50 p-5 text-left hover:border-[var(--brand-primary)]/40 ${
                      dragOverContentFolderId === folder.id && draggedEntity?.entityType === "item"
                        ? "border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]/50"
                        : "border-slate-200"
                    }`}
                    key={folder.id}
                    onClick={() => selectFolder(folder.id)}
                    onDragLeave={() => setDragOverContentFolderId(null)}
                    onDragOver={(event) => handleContentFolderDragOver(event, folder.id)}
                    onDrop={(event) => handleContentFolderDrop(event, folder.id)}
                    onDoubleClick={() => selectFolder(folder.id)}
                    onContextMenu={(event) => handleContextMenu(event, "folder", folder.id)}
                    draggable
                    onDragEnd={clearDragState}
                    onDragStart={() => handleDragStart("folder", folder.id)}
                    type="button"
                  >
                    <div className="flex items-center gap-3">
                      <FolderIcon className="h-10 w-10 text-amber-500" />
                      <div>
                        <div className="font-semibold">{folder.name}</div>
                        <div className="text-xs text-slate-500">{folder.folderTypeLabel ?? folder.folderType}</div>
                      </div>
                    </div>
                    <div className="mt-4 text-sm text-slate-500">{folder.directItems} itens • R$ {folder.totalValue.toFixed(2)}</div>
                  </button>
                ))}

                {items.map((item) => (
                  <button
                    className={`rounded-none border p-5 text-left ${selectedItemIds.has(item.id) ? "border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]/60" : "border-slate-200 bg-white hover:border-[var(--brand-primary)]/40"}`}
                    key={item.id}
                    onClick={(event) => handleItemClick(item.id, event)}
                    onDoubleClick={() => openEditItemModal(item)}
                    onContextMenu={(event) => handleContextMenu(event, "item", item.id)}
                    draggable
                    onDragEnd={clearDragState}
                    onDragStart={() => handleDragStart("item", item.id)}
                    type="button"
                  >
                    <div className="flex items-center gap-3">
                      <FileIcon className="h-10 w-10 text-sky-600" />
                      <div>
                        <div className="font-semibold">{item.name}</div>
                        <div className="text-xs text-slate-500">{item.internalCode}</div>
                      </div>
                    </div>
                    <div className="mt-4 text-sm text-slate-500">
                      {item.type} • Qtd {item.currentQuantity} • R$ {Number(item.totalValue).toFixed(2)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
            </article>
          )}
        </section>

      </div>

      {contextMenu ? (
        <div
          className="fixed z-50 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl"
          ref={contextMenuRef}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.entityType === "folder" ? (
            <>
              <button className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={() => openNewFolderModal(contextMenu.entityId)} type="button">
                Criar subpasta
              </button>
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100"
                onClick={() => {
                  const folder = folderMap.get(contextMenu.entityId);
                  if (folder) {
                    openEditFolderModal(folder);
                  }
                }}
                type="button"
              >
                Editar pasta
              </button>
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100"
                onClick={() => {
                  const folder = folderMap.get(contextMenu.entityId);
                  if (folder) {
                    openMoveFolderModal(folder);
                  }
                }}
                type="button"
              >
                Mover pasta
              </button>
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                onClick={() => {
                  void handleDeleteFolder(contextMenu.entityId);
                }}
                type="button"
              >
                Excluir pasta
              </button>
            </>
          ) : (
            <>
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100"
                onClick={() => {
                  const item = items.find((entry) => entry.id === contextMenu.entityId);
                  if (item) {
                    openEditItemModal(item);
                  }
                }}
                type="button"
              >
                Editar item
              </button>
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100"
                onClick={() => {
                  const item = items.find((entry) => entry.id === contextMenu.entityId);
                  if (item) {
                    openMoveItemModal(item);
                  }
                }}
                type="button"
              >
                Mover item
              </button>
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100"
                onClick={() => {
                  const item = items.find((entry) => entry.id === contextMenu.entityId);
                  if (item && item.type === "stock") {
                    openStockOutModal(item);
                  }
                }}
                type="button"
              >
                Saida de estoque
              </button>
            </>
          )}
        </div>
      ) : null}

      {dialogMode === "new-folder" ? (
        <Modal description="Crie uma pasta raiz ou uma subpasta na hierarquia atual." onClose={() => setDialogMode(null)} title="Nova pasta">
          <form className="space-y-4" onSubmit={handleCreateFolder}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Nome</span>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setFolderForm((current) => ({ ...current, name: event.target.value }))} required value={folderForm.name} />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">Tipo de pasta</span>
                <select
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                  onChange={(event) => {
                    const template = folderTypeTemplates.find((entry) => entry.id === event.target.value);
                    setFolderForm((current) => ({
                      ...current,
                      folderTypeTemplateId: event.target.value || "",
                      folderType: template?.baseType ?? current.folderType,
                    }));
                  }}
                  value={folderForm.folderTypeTemplateId}
                >
                  <option value="">Sem tipo personalizado</option>
                  {folderTypeTemplates.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Descricao</span>
              <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setFolderForm((current) => ({ ...current, description: event.target.value }))} value={folderForm.description} />
            </label>

            <div className="flex justify-end">
              <button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white" disabled={submitting} type="submit">
                {submitting ? "Salvando..." : "Criar pasta"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {dialogMode === "edit-folder" && selectedFolder ? (
        <Modal description={`Atualize os dados da pasta ${selectedFolder.name}.`} onClose={() => setDialogMode(null)} title="Editar pasta">
          <form className="space-y-4" onSubmit={handleEditFolder}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Nome</span>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setFolderForm((current) => ({ ...current, name: event.target.value }))} required value={folderForm.name} />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">Tipo de pasta</span>
                <select
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                  onChange={(event) => {
                    const template = folderTypeTemplates.find((entry) => entry.id === event.target.value);
                    setFolderForm((current) => ({
                      ...current,
                      folderTypeTemplateId: event.target.value || "",
                      folderType: template?.baseType ?? current.folderType,
                    }));
                  }}
                  value={folderForm.folderTypeTemplateId}
                >
                  <option value="">Sem tipo personalizado</option>
                  {folderTypeTemplates.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Descricao</span>
              <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setFolderForm((current) => ({ ...current, description: event.target.value }))} value={folderForm.description} />
            </label>

            <div className="flex justify-end">
              <button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white" disabled={submitting} type="submit">
                {submitting ? "Salvando..." : "Atualizar pasta"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {dialogMode === "move-folder" && selectedFolder ? (
        <Modal description={`Escolha o novo pai da pasta ${selectedFolder.name}.`} onClose={() => setDialogMode(null)} title="Mover pasta">
          <form className="space-y-4" onSubmit={handleMoveFolder}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Destino</span>
              <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setMoveParentId(event.target.value)} value={moveParentId}>
                <option value="ROOT">Raiz do explorer</option>
                {moveFolderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-end">
              <button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white" disabled={submitting} type="submit">
                {submitting ? "Movendo..." : "Mover pasta"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {(dialogMode === "new-item" || dialogMode === "edit-item") ? (
        <Modal
          description={dialogMode === "new-item" ? "Cadastre um novo item na pasta atual." : "Atualize os dados do item selecionado."}
          onClose={() => setDialogMode(null)}
          title={dialogMode === "new-item" ? "Novo item" : "Editar item"}
        >
          <form className="space-y-4" onSubmit={dialogMode === "new-item" ? handleCreateItem : handleEditItem}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Nome</span>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} required value={itemForm.name} />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">Tipo</span>
                <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, type: event.target.value as ItemType }))} value={itemForm.type}>
                  <option value="stock">Estoque</option>
                  <option value="asset">Patrimonio</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Codigo interno</span>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, internalCode: event.target.value }))} required value={itemForm.internalCode} />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">Codigo de barras</span>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, barcode: event.target.value }))} value={itemForm.barcode} />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Quantidade</span>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" min={0} onChange={(event) => setItemForm((current) => ({ ...current, currentQuantity: Number(event.target.value) }))} type="number" value={itemForm.currentQuantity} />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">Estoque minimo</span>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" min={0} onChange={(event) => setItemForm((current) => ({ ...current, minStock: Number(event.target.value) }))} type="number" value={itemForm.minStock} />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">Preco unitario</span>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" min={0} onChange={(event) => setItemForm((current) => ({ ...current, unitPrice: Number(event.target.value) }))} step="0.01" type="number" value={itemForm.unitPrice} />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Descricao</span>
              <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, description: event.target.value }))} value={itemForm.description} />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Notas</span>
              <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, notes: event.target.value }))} value={itemForm.notes} />
            </label>

            <div className="flex justify-end">
              <button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white" disabled={submitting} type="submit">
                {submitting ? "Salvando..." : dialogMode === "new-item" ? "Criar item" : "Atualizar item"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {dialogMode === "move-item" && selectedItem ? (
        <Modal description={`Escolha a pasta de destino para ${selectedItem.name}.`} onClose={() => setDialogMode(null)} title="Mover item">
          <form className="space-y-4" onSubmit={handleMoveItem}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Destino</span>
              <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setMoveItemFolderId(event.target.value)} value={moveItemFolderId}>
                {moveItemOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-end">
              <button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white" disabled={submitting || !moveItemFolderId} type="submit">
                {submitting ? "Movendo..." : "Mover item"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {dialogMode === "stock-out" ? (
        <Modal description="Registre uma saida de estoque com motivo e observacoes." onClose={() => setDialogMode(null)} title="Saida de estoque">
          <form className="space-y-4" onSubmit={handleStockOut}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Quantidade</span>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" min={1} onChange={(event) => setStockOutForm((current) => ({ ...current, quantity: Number(event.target.value) }))} required type="number" value={stockOutForm.quantity} />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Motivo</span>
                <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setStockOutForm((current) => ({ ...current, reason: event.target.value }))} required value={stockOutForm.reason} />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Observacoes</span>
              <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setStockOutForm((current) => ({ ...current, notes: event.target.value }))} value={stockOutForm.notes} />
            </label>

            <div className="flex justify-end">
              <button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white" disabled={submitting} type="submit">
                {submitting ? "Registrando..." : "Confirmar saida"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </AppShell>
  );
}
