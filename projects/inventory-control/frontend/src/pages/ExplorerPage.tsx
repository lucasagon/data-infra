import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../components/AppShell";
import { api } from "../lib/api";

type FolderType = "physical_location" | "logical_group" | "mixed";
type ItemType = "stock" | "asset";
type StockMovementType = "stock_in" | "stock_out" | "adjustment_in" | "adjustment_out" | "transfer";
type ViewMode = "list" | "grid";
type DialogMode =
  | "new-folder"
  | "edit-folder"
  | "move-folder"
  | "force-delete-folder"
  | "new-item"
  | "edit-item"
  | "bulk-edit-items"
  | "move-item"
  | "delete-item"
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
  colorHex: string;
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
  photos: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string;
    url: string;
  }>;
};

type ContextMenuState =
  | {
      x: number;
      y: number;
      entityType: "folder" | "item" | "content";
      entityId: string | null;
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
  ids?: string[];
};

type ItemMovement = {
  id: string;
  movementType: StockMovementType;
  quantity: number;
  reason: string;
  notes?: string | null;
  createdAt: string;
  performedBy?: {
    name?: string;
    email?: string;
  } | null;
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
    minStock: item ? String(item.minStock) : "0",
    currentQuantity: item ? String(item.currentQuantity) : "0",
    unitPrice: item ? String(item.unitPrice) : "0",
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
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="text-xl font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>

          <button className="rounded-full border border-slate-200 px-3 py-1 text-sm" onClick={onClose} type="button">
            Fechar
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function FolderIcon({ className = "h-4 w-4 text-amber-500", color }: { className?: string; color?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" style={color ? { color } : undefined} viewBox="0 0 24 24">
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("INVALID_FILE_READER_RESULT"));
        return;
      }
      const base64Data = result.split(",")[1];
      resolve(base64Data ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("IMAGE_LOAD_FAILED"));
    };
    image.src = url;
  });
}

async function compressImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const image = await loadImageFromFile(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const quality = outputType === "image/jpeg" ? 0.8 : 0.92;
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), outputType, quality);
  });

  if (!blob || blob.size >= file.size) {
    return file;
  }

  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const extension = outputType === "image/png" ? "png" : "jpg";
  return new File([blob], `${baseName}.${extension}`, { type: outputType });
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
  getFolderColor,
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
  onDropEntityOnFolder: (folderId: string, event?: React.DragEvent) => void;
  onClearDragOverFolder: () => void;
  getFolderColor: (folder: FolderSummary) => string | undefined;
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
          onDropEntityOnFolder(folder.id, event);
        }}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {hasChildren ? (
          <button
            className="flex h-5 w-5 items-center justify-center rounded border border-slate-200 bg-white text-[10px] text-slate-500"
            onClick={() => onToggle(folder.id)}
            type="button"
          >
            {isExpanded ? "-" : "+"}
          </button>
        ) : (
          <span className="h-5 w-5" />
        )}

        <button
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onSelect(folder.id)}
          onDoubleClick={() => onSelect(folder.id)}
          type="button"
        >
          <FolderIcon className="h-4 w-4 text-amber-500" color={getFolderColor(folder)} />
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
              getFolderColor={getFolderColor}
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
  const [selectedContentFolderIds, setSelectedContentFolderIds] = useState<Set<string>>(new Set());
  const [lastClickedItemId, setLastClickedItemId] = useState<string | null>(null);
  const [lastClickedContentFolderId, setLastClickedContentFolderId] = useState<string | null>(null);
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
  const [bulkEditForm, setBulkEditForm] = useState({
    description: "",
    notes: "",
  });
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
  const [pendingForceDeleteFolder, setPendingForceDeleteFolder] = useState<{ id: string; name: string } | null>(null);
  const [pendingItemPhotos, setPendingItemPhotos] = useState<File[]>([]);
  const [newItemStep, setNewItemStep] = useState(1);
  const [expandedEditSections, setExpandedEditSections] = useState<Record<string, boolean>>({
    identification: true,
    fiscal: false,
    stock: true,
    photos: false,
    movement: false,
  });
  const [itemMovements, setItemMovements] = useState<ItemMovement[]>([]);
  const [stockOperationForm, setStockOperationForm] = useState({
    direction: "in" as "in" | "out",
    quantity: 1,
    reason: "",
    notes: "",
  });
  const [expandedPhoto, setExpandedPhoto] = useState<{
    photos: Array<{ url: string; fileName: string }>;
    index: number;
  } | null>(null);

  const newItemStepValid =
    (newItemStep === 1 && itemForm.name.trim().length >= 2 && itemForm.type && itemForm.internalCode.trim().length >= 3) ||
    newItemStep === 2 ||
    (newItemStep === 3 && Number.isFinite(Number(itemForm.currentQuantity)) && Number(itemForm.currentQuantity) >= 0);

  const folderMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const folderTypeColorById = useMemo(
    () => new Map(folderTypeTemplates.map((template) => [template.id, template.colorHex])),
    [folderTypeTemplates],
  );
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
    loadFolders().catch(() => setErrorMessage("Não foi possível carregar a estrutura de pastas."));
    loadAllItems().catch(() => undefined);
    api.get("/v1/settings/folder-types").then((response) => setFolderTypeTemplates(response.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    loadItems(selectedFolderId).catch(() => setErrorMessage("Não foi possível carregar os itens da pasta."));
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

  function selectFolder(folderId: string | null) {
    setItems([]);
    setSelectedFolderId(folderId);
    setSelectedItemId(null);
    setSelectedItemIds(new Set());
    setSelectedContentFolderIds(new Set());
    setLastClickedItemId(null);
    setLastClickedContentFolderId(null);
    if (folderId) {
      setExpandedIds((current) => new Set(current).add(folderId));
    }
  }

  function handleContentFolderClick(folderId: string, event: React.MouseEvent) {
    if (event.button !== 0) {
      return;
    }

    if (event.detail === 2) {
      event.preventDefault();
      event.stopPropagation();
      selectFolder(folderId);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedContentFolderIds((current) => {
        const next = new Set(current);
        if (next.has(folderId)) {
          next.delete(folderId);
        } else {
          next.add(folderId);
        }
        return next;
      });
      setLastClickedContentFolderId(folderId);
      setSelectedItemIds(new Set());
      setSelectedItemId(null);
      setLastClickedItemId(null);
    } else if (event.shiftKey && lastClickedContentFolderId) {
      const lastIndex = childFolders.findIndex((f) => f.id === lastClickedContentFolderId);
      const currentIndex = childFolders.findIndex((f) => f.id === folderId);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const newSelection = new Set<string>();

        for (let i = start; i <= end; i++) {
          newSelection.add(childFolders[i].id);
        }

        setSelectedContentFolderIds(newSelection);
        setLastClickedContentFolderId(folderId);
        setSelectedItemIds(new Set());
        setSelectedItemId(null);
        setLastClickedItemId(null);
      }
    } else {
      setSelectedContentFolderIds(new Set([folderId]));
      setLastClickedContentFolderId(folderId);
      setSelectedItemIds(new Set());
      setSelectedItemId(null);
      setLastClickedItemId(null);
    }
  }

  function handleItemClick(itemId: string, event: React.MouseEvent) {
    if (event.button !== 0) {
      return;
    }

    if (event.detail === 2) {
      event.preventDefault();
      event.stopPropagation();
      const item = items.find((entry) => entry.id === itemId);
      if (item) {
        openEditItemModal(item);
        return;
      }
    }

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
      setSelectedContentFolderIds(new Set());
      setLastClickedContentFolderId(null);
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
        setSelectedContentFolderIds(new Set());
        setLastClickedContentFolderId(null);
      }
    } else {
      setSelectedItemIds(new Set([itemId]));
      setSelectedItemId(itemId);
      setLastClickedItemId(itemId);
      setSelectedContentFolderIds(new Set());
      setLastClickedContentFolderId(null);
    }
  }

  function handleDragStart(entityType: "folder" | "item", id: string, event: React.DragEvent) {
    const draggedIds = entityType === "item" && selectedItemIds.has(id)
      ? Array.from(selectedItemIds)
      : [id];

    const nextDraggedEntity: DragEntity = {
      entityType,
      id,
      ids: draggedIds
    };

    setDraggedEntity(nextDraggedEntity);
    event.dataTransfer.setData("application/x-inventory-drag-entity", JSON.stringify(nextDraggedEntity));
    event.dataTransfer.effectAllowed = "move";
    setDragOverFolderId(null);
    setDragOverContentFolderId(null);
  }

  function resolveDraggedEntity(event?: React.DragEvent): DragEntity | null {
    if (draggedEntity) {
      return draggedEntity;
    }
    if (!event) {
      return null;
    }

    const raw = event.dataTransfer.getData("application/x-inventory-drag-entity");
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as DragEntity;
      if (!parsed?.entityType || !parsed?.id) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function clearDragState() {
    setDraggedEntity(null);
    setDragOverFolderId(null);
    setDragOverContentFolderId(null);
  }

  function handleContentFolderDragOver(event: React.DragEvent, folderId: string) {
    const activeDraggedEntity = resolveDraggedEntity(event);
    if (activeDraggedEntity?.entityType !== "item") {
      return;
    }
    event.preventDefault();
    setDragOverContentFolderId(folderId);
  }

  function handleContentFolderDrop(event: React.DragEvent, folderId: string) {
    const activeDraggedEntity = resolveDraggedEntity(event);
    if (activeDraggedEntity?.entityType !== "item") {
      return;
    }
    event.preventDefault();
    void dropEntityOnFolder(folderId, event);
  }

  async function dropEntityOnFolder(targetFolderId: string, event?: React.DragEvent) {
    const activeDraggedEntity = resolveDraggedEntity(event);
    if (!activeDraggedEntity) {
      return;
    }

    setDragOverFolderId(null);
    setDragOverContentFolderId(null);
    setMessage();

    try {
      if (activeDraggedEntity.entityType === "folder") {
        if (activeDraggedEntity.id === targetFolderId) {
          clearDragState();
          return;
        }

        await api.post(`/v1/folders/${activeDraggedEntity.id}/move`, {
          parentId: targetFolderId,
        });

        await loadFolders(selectedFolderId);
        await loadItems(selectedFolderId);
        await loadAllItems();
        setMessage("Pasta movida com sucesso.");
      } else {
        const itemsToMove = activeDraggedEntity.ids || [activeDraggedEntity.id];
        const sourceItems = itemsToMove
          .map((id) => allItems.find((item) => item.id === id))
          .filter((item) => item !== undefined) as ItemSummary[];

        if (sourceItems.length === 0 || sourceItems.every((item) => item.folderId === targetFolderId)) {
          clearDragState();
          return;
        }

        const movePromises = sourceItems.map((item) =>
          api.post(`/v1/items/${item.id}/transfer`, {
            destinationFolderId: targetFolderId,
            reason: "Reorganizacao de estrutura",
            notes: "Movimentado pelo explorer (arrastar e soltar)",
          }),
        );

        await Promise.all(movePromises);

        await loadItems(selectedFolderId);
        await loadFolders(selectedFolderId);
        await loadAllItems();
        setSelectedItemIds(new Set());
        setSelectedItemId(null);
        setMessage(`${itemsToMove.length} item${itemsToMove.length !== 1 ? "ns" : ""} movido${itemsToMove.length !== 1 ? "s" : ""} com sucesso.`);
      }
    } catch {
      setMessage(undefined, "Não foi possível concluir a movimentação por arrastar e soltar.");
    } finally {
      clearDragState();
    }
  }

  async function dropEntityOnRoot(event?: React.DragEvent) {
    const activeDraggedEntity = resolveDraggedEntity(event);
    if (!activeDraggedEntity) {
      return;
    }

    setDragOverFolderId(null);
    setDragOverContentFolderId(null);
    setMessage();

    try {
      if (activeDraggedEntity.entityType === "folder") {
        await api.post(`/v1/folders/${activeDraggedEntity.id}/move`, {
          parentId: null,
        });

        await loadFolders(activeDraggedEntity.id);
        await loadItems(selectedFolderId);
        await loadAllItems();
        setMessage("Pasta movida para o nível raiz com sucesso.");
      } else {
        setMessage(undefined, "Itens não podem ser movidos para Todos os Arquivos.");
      }
    } catch {
      setMessage(undefined, "Não foi possível mover a pasta para o nível raiz.");
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

  function handleContextMenu(event: React.MouseEvent, entityType: "folder" | "item" | "content", entityId: string | null) {
    event.preventDefault();

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      entityType,
      entityId,
    });
  }

  function handleContentAreaContextMenu(event: React.MouseEvent) {
    handleContextMenu(event, "content", selectedFolderId);
  }

  function openNewFolderModal(parentId: string | null) {
    const defaultTemplateId = getDefaultFolderTemplateId();
    const defaultTemplate = folderTypeTemplates.find((entry) => entry.id === defaultTemplateId);
    setFolderForm({
      ...createFolderForm(parentId),
      folderTypeTemplateId: defaultTemplateId,
      folderType: defaultTemplate?.baseType ?? "mixed",
    });
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
    setPendingItemPhotos([]);
    setNewItemStep(1);
    setDialogMode("new-item");
    setContextMenu(null);
  }

  function updatePendingPhotoAtIndex(index: number, file?: File) {
    setPendingItemPhotos((current) => {
      const next = [...current];
      if (!file) {
        if (index < next.length) {
          next.splice(index, 1);
        }
        return next.slice(0, 3);
      }
      next[index] = file;
      return next.filter(Boolean).slice(0, 3);
    });
  }

  function renderPendingPhotoSlots(existingCount = 0) {
    const maxSlots = Math.max(0, 3 - existingCount);
    if (maxSlots === 0) {
      return <div className="text-xs text-slate-500">Limite máximo de 3 fotos atingido para este item.</div>;
    }

    const activeSlots = Math.min(maxSlots, pendingItemPhotos.length + 1);
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: activeSlots }).map((_, index) => {
          const file = pendingItemPhotos[index];
          return (
            <div className="rounded-xl border border-dashed border-slate-300 p-3" key={`photo-slot-${index}`}>
              {file ? <div className="mb-2 truncate text-xs text-slate-600">{file.name}</div> : <div className="mb-2 text-xs text-slate-500">Foto {index + 1}</div>}
              <input
                accept="image/jpeg,image/png"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs"
                onChange={(event) => updatePendingPhotoAtIndex(index, event.target.files?.[0])}
                type="file"
              />
              {file ? (
                <button
                  className="mt-2 w-full rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                  onClick={() => updatePendingPhotoAtIndex(index)}
                  type="button"
                >
                  Remover
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  function openEditItemModal(item: ItemSummary) {
    setItemForm(createItemForm(item.folderId, item));
    setPendingItemPhotos([]);
    setSelectedItemId(item.id);
    setExpandedEditSections({
      identification: false,
      fiscal: false,
      stock: false,
      photos: false,
      movement: false,
    });
    setStockOperationForm({
      direction: "in",
      quantity: 1,
      reason: "",
      notes: "",
    });
    void loadItemMovements(item.id);
    setDialogMode("edit-item");
    setContextMenu(null);
  }

  async function loadItemMovements(itemId: string) {
    try {
      const response = await api.get(`/v1/items/${itemId}/movements`);
      setItemMovements(response.data);
    } catch {
      setItemMovements([]);
    }
  }

  function toggleEditSection(section: string) {
    setExpandedEditSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function openMoveItemModal(item: ItemSummary) {
    setSelectedItemId(item.id);
    setSelectedItemIds(new Set([item.id]));
    setMoveItemFolderId(item.folderId);
    setDialogMode("move-item");
    setContextMenu(null);
  }

  function openBulkEditItemsModal() {
    if (selectedItemIds.size === 0) {
      return;
    }

    setBulkEditForm({
      description: "",
      notes: "",
    });
    setDialogMode("bulk-edit-items");
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

  function openDeleteItemModal(item: ItemSummary) {
    setSelectedItemId(item.id);
    setDialogMode("delete-item");
    setContextMenu(null);
  }

  async function handleCreateFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage();

    try {
      // Sempre cria no contexto de navegação atual.
      const parentIdForCreate = selectedFolderId;
      const response = await api.post("/v1/folders", {
        ...folderForm,
        parentId: parentIdForCreate,
        folderTypeTemplateId: folderForm.folderTypeTemplateId || null,
      });
      await loadFolders(response.data.id);
      setDialogMode(null);
      setMessage(`Pasta "${response.data.name}" criada com sucesso.`);
    } catch (error) {
      const apiError = error as { response?: { data?: { error?: { code?: string } } } };
      if (apiError.response?.data?.error?.code === "P2002" || apiError.response?.data?.error?.code === "FOLDER_NAME_ALREADY_EXISTS") {
        setMessage(undefined, "Já existe uma pasta com esse nome neste local.");
        return;
      }
      setMessage(undefined, "Não foi possível criar a pasta.");
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
      setMessage(undefined, "Não foi possível atualizar a pasta.");
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
      setMessage(undefined, "Não foi possível mover a pasta.");
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

      let photoUploadFailed = false;
      if (pendingItemPhotos.length > 0) {
        try {
          await uploadItemPhotos(response.data.id, pendingItemPhotos, 0);
        } catch {
          photoUploadFailed = true;
        }
      }

      await loadItems(itemForm.folderId);
      await loadFolders(itemForm.folderId);
      await loadAllItems();
      setSelectedFolderId(itemForm.folderId);
      setSelectedItemId(response.data.id);
      setDialogMode(null);
      setPendingItemPhotos([]);
      setMessage(
        photoUploadFailed
          ? `Item "${itemForm.name}" criado, mas uma ou mais fotos não foram enviadas.`
          : `Item "${itemForm.name}" criado com sucesso.`,
      );
    } catch {
      setMessage(undefined, "Não foi possível criar o item.");
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
      const existingCount = selectedItem?.photos.length ?? 0;
      if (pendingItemPhotos.length > 0) {
        await uploadItemPhotos(selectedItemId, pendingItemPhotos, existingCount);
      }
      setSelectedFolderId(itemForm.folderId);
      setDialogMode(null);
      setPendingItemPhotos([]);
      setMessage(`Item "${itemForm.name}" atualizado com sucesso.`);
    } catch {
      setMessage(undefined, "Não foi possível atualizar o item.");
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadItemPhotos(itemId: string, files: File[], existingCount: number) {
    const remainingSlots = Math.max(0, 3 - existingCount);
    const filesToUpload = files.slice(0, remainingSlots);
    for (const originalFile of filesToUpload) {
      const file = await compressImageFile(originalFile);
      const base64Data = await fileToBase64(file);
      await api.post(`/v1/items/${itemId}/photos`, {
        fileName: file.name,
        mimeType: file.type,
        base64Data,
      });
    }
    await loadItems(selectedFolderId);
    await loadAllItems();
  }

  async function handleDeleteItemPhoto(itemId: string, photoId: string) {
    setMessage();
    try {
      await api.delete(`/v1/items/${itemId}/photos/${photoId}`);
      await loadItems(selectedFolderId);
      await loadAllItems();
      setMessage("Foto removida com sucesso.");
    } catch {
      setMessage(undefined, "Não foi possível remover a foto.");
    }
  }

  async function handleMoveItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const idsToMove = selectedItemIds.size > 0 ? Array.from(selectedItemIds) : selectedItemId ? [selectedItemId] : [];
    if (idsToMove.length === 0) {
      return;
    }

    setSubmitting(true);
    setMessage();

    try {
      await Promise.all(
        idsToMove.map((id) =>
          api.post(`/v1/items/${id}/transfer`, {
            destinationFolderId: moveItemFolderId,
            reason: "Reorganizacao de estrutura",
            notes: "Movimentado pelo explorer",
          }),
        ),
      );
      await loadItems(selectedFolderId);
      await loadFolders(moveItemFolderId);
      await loadAllItems();
      setDialogMode(null);
      setSelectedItemIds(new Set());
      setSelectedItemId(null);
      setMessage(`${idsToMove.length} item${idsToMove.length !== 1 ? "ns" : ""} movido${idsToMove.length !== 1 ? "s" : ""} com sucesso.`);
    } catch {
      setMessage(undefined, "Não foi possível mover o item.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBulkEditItems(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const idsToEdit = Array.from(selectedItemIds);
    if (idsToEdit.length === 0) {
      return;
    }

    const payload: Record<string, string> = {};
    if (bulkEditForm.description.trim()) {
      payload.description = bulkEditForm.description.trim();
    }
    if (bulkEditForm.notes.trim()) {
      payload.notes = bulkEditForm.notes.trim();
    }

    if (Object.keys(payload).length === 0) {
      setMessage(undefined, "Preencha ao menos um campo para aplicar nos itens selecionados.");
      return;
    }

    setSubmitting(true);
    setMessage();

    try {
      await Promise.all(idsToEdit.map((id) => api.patch(`/v1/items/${id}`, payload)));
      await loadItems(selectedFolderId);
      await loadAllItems();
      setDialogMode(null);
      setMessage(`${idsToEdit.length} item${idsToEdit.length !== 1 ? "ns" : ""} atualizado${idsToEdit.length !== 1 ? "s" : ""} com sucesso.`);
    } catch {
      setMessage(undefined, "Não foi possível atualizar os itens selecionados.");
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
      setMessage(undefined, "Não foi possível registrar a saída de estoque.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStockOperation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItemId) {
      return;
    }

    setSubmitting(true);
    setMessage();
    try {
      if (stockOperationForm.direction === "in") {
        await api.post(`/v1/items/${selectedItemId}/stock-in`, {
          quantity: Number(stockOperationForm.quantity),
          reason: stockOperationForm.reason,
          notes: stockOperationForm.notes,
        });
      } else {
        await api.post(`/v1/items/${selectedItemId}/stock-out`, {
          quantity: Number(stockOperationForm.quantity),
          reason: stockOperationForm.reason,
          notes: stockOperationForm.notes,
        });
      }

      await loadItems(selectedFolderId);
      await loadFolders(selectedFolderId);
      await loadAllItems();
      await loadItemMovements(selectedItemId);
      setStockOperationForm({
        direction: "in",
        quantity: 1,
        reason: "",
        notes: "",
      });
      setMessage("Movimentação de estoque registrada com sucesso.");
    } catch {
      setMessage(undefined, "Não foi possível registrar a movimentação de estoque.");
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
      `Tem certeza que deseja excluir a pasta "${folder.name}"? Essa ação e irreversível.`,
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
      setMessage(`Pasta "${folder.name}" excluída com sucesso.`);
    } catch (error) {
      const apiError = error as { response?: { data?: { error?: { code?: string } } } };
      if (apiError.response?.data?.error?.code === "FOLDER_NOT_EMPTY") {
        setPendingForceDeleteFolder({ id: folder.id, name: folder.name });
        setMessage(undefined, "Não foi possível excluir: a pasta ainda possui subpastas ou itens.");
        return;
      }
      setMessage(undefined, "Não foi possível excluir a pasta.");
    }
  }

  async function handleForceDeleteFolder() {
    if (!pendingForceDeleteFolder) {
      return;
    }

    setSubmitting(true);
    setMessage();

    try {
      await api.post(`/v1/folders/${pendingForceDeleteFolder.id}/inactivate-recursive`);
      const preferredFolderId = selectedFolderId === pendingForceDeleteFolder.id ? null : selectedFolderId;
      await loadFolders(preferredFolderId);
      await loadItems(preferredFolderId);
      await loadAllItems();
      setDialogMode(null);
      setPendingForceDeleteFolder(null);
      setMessage(`Pasta "${pendingForceDeleteFolder.name}" excluída com todo o conteúdo.`);
    } catch {
      setMessage(undefined, "Não foi possível excluir a pasta com todo o conteúdo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteMultipleItems() {
    setMessage();

    try {
      const deletePromises = Array.from(selectedItemIds).map((itemId) =>
        api.post(`/v1/items/${itemId}/inactivate`),
      );

      await Promise.all(deletePromises);
      await loadItems(selectedFolderId);
      await loadFolders(selectedFolderId);
      await loadAllItems();
      setSelectedItemIds(new Set());
      setSelectedItemId(null);
      setMessage(`${selectedItemIds.size} item${selectedItemIds.size !== 1 ? "ns" : ""} excluido${selectedItemIds.size !== 1 ? "s" : ""} com sucesso.`);
    } catch {
      setMessage(undefined, "Não foi possível excluir os itens.");
    }
  }

  async function handleDeleteItem() {
    if (!selectedItemId) {
      return;
    }

    setSubmitting(true);
    setMessage();

    try {
      await api.post(`/v1/items/${selectedItemId}/inactivate`);
      await loadItems(selectedFolderId);
      await loadFolders(selectedFolderId);
      await loadAllItems();
      setSelectedItemId(null);
      setSelectedItemIds(new Set());
      setDialogMode(null);
      setMessage("Item excluído com sucesso.");
    } catch {
      setMessage(undefined, "Não foi possível excluir o item.");
    } finally {
      setSubmitting(false);
    }
  }

  const rootFolders = childrenByParent.get(null) ?? [];
  const getFolderColor = (folder: FolderSummary) => folderTypeColorById.get(folder.folderTypeTemplateId ?? "") ?? undefined;
  const getFolderColorById = (folderId: string) => {
    const folder = folderMap.get(folderId);
    return folder ? getFolderColor(folder) : undefined;
  };
  const getDefaultFolderTemplateId = () =>
    folderTypeTemplates.find((template) => template.key === "mixed")?.id ?? folderTypeTemplates[0]?.id ?? "";

  return (
    <AppShell>
      <div className="space-y-4">
        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{statusMessage}</div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{errorMessage}</span>
              {pendingForceDeleteFolder ? (
                <button
                  className="rounded-full border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                  onClick={() => setDialogMode("force-delete-folder")}
                  type="button"
                >
                  Apagar mesmo assim
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid h-auto min-h-0 gap-6 xl:h-[calc(100vh-200px)] xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-none border border-slate-200 bg-white p-4 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.35)] flex flex-col">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">N A V E G A Ç Ã O</p>
          </div>

          <div className="rounded-none border border-slate-200 bg-slate-50 p-3 flex-1 overflow-y-auto">
            <div className="space-y-1">
              <button
                className={`flex w-full items-center gap-2 rounded-xl px-2 py-1 text-sm ${
                  dragOverFolderId === "ROOT"
                    ? "bg-[var(--brand-primary-soft)] text-slate-900 ring-1 ring-[var(--brand-primary)]"
                    : ""
                } ${
                  selectedFolderId === null
                    ? "bg-[var(--brand-primary-soft)] text-slate-900"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                onDragLeave={() => setDragOverFolderId(null)}
                onDragOver={(event) => {
                  const activeDraggedEntity = resolveDraggedEntity(event);
                  if (activeDraggedEntity?.entityType !== "folder") {
                    return;
                  }
                  event.preventDefault();
                  setDragOverFolderId("ROOT");
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  void dropEntityOnRoot(event);
                }}
                onClick={() => selectFolder(null)}
                type="button"
              >
                <FolderIcon className="h-4 w-4 text-amber-500" />
                <span className="font-medium">Todos os Arquivos</span>
              </button>
              <div className="border-t border-slate-200" />
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
                  getFolderColor={getFolderColor}
                />
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col space-y-5 overflow-visible">
          <article className="rounded-none border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.25)]">
            <form className="relative z-40" onSubmit={handleSearchSubmit}>
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
                <div className="absolute left-0 z-[80] mt-2 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-xl">
                  {searchSuggestions.length > 0 ? (
                    searchSuggestions.map((result) => (
                      <button
                        className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-100"
                        key={`${result.entityType}-${result.id}`}
                        onClick={() => openSearchResult(result)}
                        type="button"
                      >
                        {result.entityType === "folder" ? (
                          <FolderIcon className="mt-0.5 h-4 w-4 text-amber-500" color={getFolderColorById(result.id)} />
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
                        <FolderIcon className="mt-0.5 h-5 w-5 text-amber-500" color={getFolderColorById(result.id)} />
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
            <article className="rounded-none border border-slate-200 bg-white shadow-[0_20px_50px_-35px_rgba(15,23,42,0.25)] flex flex-col h-full">
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
                    <div className="relative z-40" ref={optionsMenuRef}>
                      <button
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                        onClick={() => setOptionsMenuOpen((current) => !current)}
                        type="button"
                      >
                        Opções
                      </button>

                    {optionsMenuOpen ? (
                      <div className="absolute left-0 top-11 z-[80] w-full min-w-52 border border-slate-200 bg-white p-2 shadow-lg sm:left-auto sm:right-0 sm:w-52">
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
                        {selectedItemIds.size > 0 ? (
                          <>
                            <div className="my-2 border-t border-slate-100" />
                            <div className="px-2 pb-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Ações em massa</div>
                            <button
                              className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100"
                              onClick={() => {
                                openBulkEditItemsModal();
                                setOptionsMenuOpen(false);
                              }}
                              type="button"
                            >
                              Editar {selectedItemIds.size} {selectedItemIds.size === 1 ? "item" : "itens"}
                            </button>
                            <button
                              className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100"
                              onClick={() => {
                                setDialogMode("move-item");
                                setOptionsMenuOpen(false);
                              }}
                              type="button"
                            >
                              Mover {selectedItemIds.size} {selectedItemIds.size === 1 ? "item" : "itens"}
                            </button>
                            <button
                              className="block w-full rounded-md px-2 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                              onClick={() => {
                                const confirmed = window.confirm(
                                  `Tem certeza que deseja excluir ${selectedItemIds.size} ${selectedItemIds.size === 1 ? "item" : "itens"}? Essa ação e irreversível.`,
                                );
                                if (confirmed) {
                                  handleDeleteMultipleItems();
                                  setOptionsMenuOpen(false);
                                }
                              }}
                              type="button"
                            >
                              Excluir {selectedItemIds.size} {selectedItemIds.size === 1 ? "item" : "itens"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {viewMode === "list" ? (
              <div className="flex-1 overflow-auto" onContextMenu={handleContentAreaContextMenu}>
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
                        className={`border-b border-slate-100 ${selectedContentFolderIds.has(folder.id) ? "bg-[var(--brand-primary-soft)]/70" : "hover:bg-slate-50"} ${
                          dragOverContentFolderId === folder.id && draggedEntity?.entityType === "item"
                            ? "bg-[var(--brand-primary-soft)]/60"
                            : ""
                        }`}
                        key={folder.id}
                        onClick={(event) => handleContentFolderClick(folder.id, event)}
                        onContextMenu={(event) => handleContextMenu(event, "folder", folder.id)}
                        onDragLeave={() => setDragOverContentFolderId(null)}
                        onDragOver={(event) => handleContentFolderDragOver(event, folder.id)}
                        onDrop={(event) => handleContentFolderDrop(event, folder.id)}
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          selectFolder(folder.id);
                        }}
                        draggable
                        onDragEnd={clearDragState}
                        onDragStart={(event) => handleDragStart("folder", folder.id, event)}
                        onMouseDown={(event) => {
                          if (event.button === 0 && event.detail === 2) {
                            event.preventDefault();
                            event.stopPropagation();
                            selectFolder(folder.id);
                          }
                        }}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3 text-left">
                            <FolderIcon className="h-5 w-5 text-amber-500" color={getFolderColor(folder)} />
                            <span className="font-medium">{folder.name}</span>
                          </div>
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
                        className={`border-b border-slate-100 ${selectedItemIds.has(item.id) ? "bg-[var(--brand-primary-soft)]/70" : "hover:bg-slate-50"}`}
                        key={item.id}
                        onContextMenu={(event) => handleContextMenu(event, "item", item.id)}
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openEditItemModal(item);
                        }}
                        onClick={(event) => handleItemClick(item.id, event)}
                        draggable
                        onDragEnd={clearDragState}
                        onDragStart={(event) => handleDragStart("item", item.id, event)}
                        onMouseDown={(event) => {
                          if (event.button === 0 && event.detail === 2) {
                            event.preventDefault();
                            event.stopPropagation();
                            openEditItemModal(item);
                          }
                        }}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3 text-left">
                            <FileIcon className="h-5 w-5 text-sky-600" />
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-xs text-slate-400">{item.internalCode}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-500">{item.type === "asset" ? "Patrimonio" : "Estoque"}</td>
                        <td className="px-5 py-3 text-slate-500">
                          Qtd {item.currentQuantity} • Min {item.minStock}
                        </td>
                        <td className="px-5 py-3 text-slate-500">R$ {Number(item.totalValue).toFixed(2)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-100" onClick={(e) => { e.stopPropagation(); openEditItemModal(item); }} type="button">
                              Editar
                            </button>
                            <button className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-100" onClick={(e) => { e.stopPropagation(); openMoveItemModal(item); }} type="button">
                              Mover
                            </button>
                            <button className="rounded-full border border-rose-200 px-3 py-1 text-xs text-rose-600 hover:bg-rose-50" onClick={(e) => { e.stopPropagation(); openDeleteItemModal(item); }} type="button">
                              Excluir
                            </button>
                            {item.type === "stock" ? (
                              <button className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-100" onClick={(e) => { e.stopPropagation(); openStockOutModal(item); }} type="button">
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
            <div className="p-5 flex-1 overflow-auto" onContextMenu={handleContentAreaContextMenu}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {childFolders.map((folder) => (
                  <button
                    className={`rounded-none border p-5 text-left ${selectedContentFolderIds.has(folder.id) ? "border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]/60" : "border-slate-200 bg-white hover:bg-slate-50 hover:border-[var(--brand-primary)]/40"} ${
                      dragOverContentFolderId === folder.id && draggedEntity?.entityType === "item"
                        ? "border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]/50"
                        : ""
                    }`}
                    key={folder.id}
                    onClick={(event) => handleContentFolderClick(folder.id, event)}
                    onDragLeave={() => setDragOverContentFolderId(null)}
                    onDragOver={(event) => handleContentFolderDragOver(event, folder.id)}
                    onDrop={(event) => handleContentFolderDrop(event, folder.id)}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      selectFolder(folder.id);
                    }}
                    onContextMenu={(event) => handleContextMenu(event, "folder", folder.id)}
                    draggable
                    onDragEnd={clearDragState}
                    onDragStart={(event) => handleDragStart("folder", folder.id, event)}
                    onMouseDown={(event) => {
                      if (event.button === 0 && event.detail === 2) {
                        event.preventDefault();
                        event.stopPropagation();
                        selectFolder(folder.id);
                      }
                    }}
                    type="button"
                  >
                    <div className="flex items-center gap-3">
                      <FolderIcon className="h-10 w-10 text-amber-500" color={getFolderColor(folder)} />
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
                    className={`rounded-none border p-5 text-left ${selectedItemIds.has(item.id) ? "border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]/60" : "border-slate-200 bg-white hover:bg-slate-50 hover:border-[var(--brand-primary)]/40"}`}
                    key={item.id}
                    onClick={(event) => handleItemClick(item.id, event)}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openEditItemModal(item);
                    }}
                    onContextMenu={(event) => handleContextMenu(event, "item", item.id)}
                    draggable
                    onDragEnd={clearDragState}
                    onDragStart={(event) => handleDragStart("item", item.id, event)}
                    onMouseDown={(event) => {
                      if (event.button === 0 && event.detail === 2) {
                        event.preventDefault();
                        event.stopPropagation();
                        openEditItemModal(item);
                      }
                    }}
                    type="button"
                  >
                    <div className="flex items-center gap-3">
                      {item.photos.length > 0 ? (
                        <img alt={item.photos[0].fileName} className="h-10 w-10 rounded-md object-cover" src={item.photos[0].url} />
                      ) : (
                        <FileIcon className="h-10 w-10 text-sky-600" />
                      )}
                      <div>
                        <div className="font-semibold">{item.name}</div>
                        <div className="text-xs text-slate-500">{item.internalCode}</div>
                      </div>
                    </div>
                    <div className="mt-4 text-sm text-slate-500">
                      {item.type} • Qtd {item.currentQuantity} • R$ {Number(item.totalValue).toFixed(2)}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); openEditItemModal(item); }} type="button">
                        Editar
                      </button>
                      <button className="rounded-full border border-slate-200 px-3 py-1 text-xs hover:bg-slate-100" onClick={(event) => { event.stopPropagation(); openMoveItemModal(item); }} type="button">
                        Mover
                      </button>
                      <button className="rounded-full border border-rose-200 px-3 py-1 text-xs text-rose-600 hover:bg-rose-50" onClick={(event) => { event.stopPropagation(); openDeleteItemModal(item); }} type="button">
                        Excluir
                      </button>
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
              <button className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100" onClick={() => openNewFolderModal(contextMenu.entityId ?? null)} type="button">
                Criar subpasta
              </button>
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100"
                onClick={() => {
                  if (!contextMenu.entityId) {
                    return;
                  }
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
                  if (!contextMenu.entityId) {
                    return;
                  }
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
                  if (contextMenu.entityId) {
                    void handleDeleteFolder(contextMenu.entityId);
                  }
                }}
                type="button"
              >
                Excluir pasta
              </button>
            </>
          ) : contextMenu.entityType === "item" ? (
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
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                onClick={() => {
                  const item = items.find((entry) => entry.id === contextMenu.entityId);
                  if (item) {
                    openDeleteItemModal(item);
                  }
                }}
                type="button"
              >
                Excluir item
              </button>
            </>
          ) : (
            <>
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100"
                onClick={() => openNewFolderModal(contextMenu.entityId)}
                type="button"
              >
                {contextMenu.entityId ? "Criar subpasta" : "Criar pasta raiz"}
              </button>
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={!contextMenu.entityId}
                onClick={() => {
                  if (contextMenu.entityId) {
                    openNewItemModal(contextMenu.entityId);
                  }
                }}
                type="button"
              >
                Novo item
              </button>
              {contextMenu.entityId ? (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100"
                    onClick={() => {
                      const folder = folderMap.get(contextMenu.entityId ?? "");
                      if (folder) {
                        openEditFolderModal(folder);
                      }
                    }}
                    type="button"
                  >
                    Editar pasta atual
                  </button>
                  <button
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-100"
                    onClick={() => {
                      const folder = folderMap.get(contextMenu.entityId ?? "");
                      if (folder) {
                        openMoveFolderModal(folder);
                      }
                    }}
                    type="button"
                  >
                    Mover pasta atual
                  </button>
                  <button
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                    onClick={() => {
                      if (contextMenu.entityId) {
                        void handleDeleteFolder(contextMenu.entityId);
                      }
                    }}
                    type="button"
                  >
                    Excluir pasta atual
                  </button>
                </>
              ) : null}
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
                      folderTypeTemplateId: event.target.value,
                      folderType: template?.baseType ?? current.folderType,
                    }));
                  }}
                  required
                  value={folderForm.folderTypeTemplateId}
                >
                  {folderTypeTemplates.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Descrição</span>
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
                      folderTypeTemplateId: event.target.value,
                      folderType: template?.baseType ?? current.folderType,
                    }));
                  }}
                  value={folderForm.folderTypeTemplateId}
                >
                  {folderTypeTemplates.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Descrição</span>
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
          {dialogMode === "new-item" ? (
            <form className="space-y-4" onSubmit={handleCreateItem}>
              <p className="text-xs text-slate-500">Os campos com * são obrigatórios.</p>
              <div className="space-y-2">
                <div className="mb-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Etapa {newItemStep} de 3</div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((step) => (
                    <div key={step}>
                      <div className={`h-2 w-full rounded-full ${step <= newItemStep ? "bg-[var(--brand-primary)]" : "bg-slate-200"}`} />
                      <div className={`mt-1 text-center text-[11px] ${step === newItemStep ? "text-slate-800" : "text-slate-500"}`}>
                        {step === 1 ? "Dados" : step === 2 ? "Notas" : "Estoque"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {newItemStep === 1 ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium">Nome *</span>
                      <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} required value={itemForm.name} />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium">Tipo *</span>
                      <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, type: event.target.value as ItemType }))} required value={itemForm.type}>
                        <option value="stock">Estoque</option>
                        <option value="asset">Patrimônio</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium">Código interno *</span>
                      <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, internalCode: event.target.value }))} required value={itemForm.internalCode} />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium">Código de barras</span>
                      <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, barcode: event.target.value }))} value={itemForm.barcode} />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Descrição</span>
                    <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, description: event.target.value }))} value={itemForm.description} />
                  </label>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Foto</div>
                    <div className="text-xs text-slate-500">Formatos permitidos: PNG, JPG e JPEG. Tamanho máximo: 5 MB por arquivo.</div>
                    {pendingItemPhotos.length > 0 ? <div className="text-xs text-slate-500">{pendingItemPhotos.length} foto(s) pronta(s) para envio.</div> : null}
                    {renderPendingPhotoSlots(0)}
                  </div>
                </div>
              ) : null}

              {newItemStep === 2 ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Números de Notas Fiscais</span>
                  <textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, notes: event.target.value }))} value={itemForm.notes} />
                </label>
              ) : null}

              {newItemStep === 3 ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Estoque Inicial *</span>
                    <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" min={0} onChange={(event) => setItemForm((current) => ({ ...current, currentQuantity: event.target.value }))} required type="number" value={itemForm.currentQuantity} />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Estoque mínimo</span>
                    <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" min={0} onChange={(event) => setItemForm((current) => ({ ...current, minStock: event.target.value }))} type="number" value={itemForm.minStock} />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">Preço unitário</span>
                    <input className="w-full rounded-2xl border border-slate-200 px-4 py-3" min={0} onChange={(event) => setItemForm((current) => ({ ...current, unitPrice: event.target.value }))} step="0.01" type="number" value={itemForm.unitPrice} />
                  </label>
                </div>
              ) : null}

              <div className="flex justify-between">
                <button className="rounded-full border border-slate-200 px-5 py-2 text-sm" disabled={newItemStep === 1} onClick={() => setNewItemStep((current) => Math.max(1, current - 1))} type="button">
                  Voltar
                </button>
                {newItemStep < 3 ? (
                  <button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!newItemStepValid} onClick={() => setNewItemStep((current) => Math.min(3, current + 1))} type="button">
                    Próximo
                  </button>
                ) : (
                  <button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={submitting || !newItemStepValid} type="submit">
                    {submitting ? "Salvando..." : "Criar item"}
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {[
                { key: "identification", label: "Identificação" },
                { key: "fiscal", label: "Números de Notas Fiscais" },
                { key: "stock", label: "Estoque" },
                { key: "photos", label: "Fotos" },
                { key: "movement", label: "Entrada e Saída de Estoque" },
              ].map((section) => (
                <div className="rounded-xl border border-slate-200" key={section.key}>
                  <button className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium" onClick={() => toggleEditSection(section.key)} type="button">
                    <span>{section.label}</span>
                    <span>{expandedEditSections[section.key] ? "-" : "+"}</span>
                  </button>
                  {expandedEditSections[section.key] ? (
                    <div className="border-t border-slate-200 p-4">
                      {section.key === "identification" ? (
                        <form className="space-y-4" onSubmit={handleEditItem}>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="block"><span className="mb-2 block text-sm font-medium">Nome</span><input className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} required value={itemForm.name} /></label>
                            <label className="block"><span className="mb-2 block text-sm font-medium">Tipo</span><select className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, type: event.target.value as ItemType }))} required value={itemForm.type}><option value="stock">Estoque</option><option value="asset">Patrimônio</option></select></label>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <label className="block"><span className="mb-2 block text-sm font-medium">Código interno</span><input className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, internalCode: event.target.value }))} required value={itemForm.internalCode} /></label>
                            <label className="block"><span className="mb-2 block text-sm font-medium">Código de barras</span><input className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, barcode: event.target.value }))} value={itemForm.barcode} /></label>
                          </div>
                          <label className="block"><span className="mb-2 block text-sm font-medium">Descrição</span><textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, description: event.target.value }))} value={itemForm.description} /></label>
                          <div className="flex justify-end"><button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white" disabled={submitting} type="submit">{submitting ? "Salvando..." : "Salvar identificação"}</button></div>
                        </form>
                      ) : null}

                      {section.key === "fiscal" ? (
                        <form className="space-y-4" onSubmit={handleEditItem}>
                          <label className="block"><span className="mb-2 block text-sm font-medium">Números de Notas Fiscais</span><textarea className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setItemForm((current) => ({ ...current, notes: event.target.value }))} value={itemForm.notes} /></label>
                          <div className="flex justify-end"><button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white" disabled={submitting} type="submit">{submitting ? "Salvando..." : "Salvar notas fiscais"}</button></div>
                        </form>
                      ) : null}

                      {section.key === "stock" ? (
                        <form className="space-y-4" onSubmit={handleEditItem}>
                          <div className="grid gap-4 md:grid-cols-3">
                            <label className="block"><span className="mb-2 block text-sm font-medium">Estoque Inicial</span><input className="w-full rounded-2xl border border-slate-200 px-4 py-3" min={0} onChange={(event) => setItemForm((current) => ({ ...current, currentQuantity: event.target.value }))} required type="number" value={itemForm.currentQuantity} /></label>
                            <label className="block"><span className="mb-2 block text-sm font-medium">Estoque mínimo</span><input className="w-full rounded-2xl border border-slate-200 px-4 py-3" min={0} onChange={(event) => setItemForm((current) => ({ ...current, minStock: event.target.value }))} type="number" value={itemForm.minStock} /></label>
                            <label className="block"><span className="mb-2 block text-sm font-medium">Preço unitário</span><input className="w-full rounded-2xl border border-slate-200 px-4 py-3" min={0} onChange={(event) => setItemForm((current) => ({ ...current, unitPrice: event.target.value }))} step="0.01" type="number" value={itemForm.unitPrice} /></label>
                          </div>
                          <div className="flex justify-end"><button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white" disabled={submitting} type="submit">{submitting ? "Salvando..." : "Salvar estoque"}</button></div>
                        </form>
                      ) : null}

                      {section.key === "photos" ? (
                        <div className="space-y-3">
                          {selectedItem && selectedItem.photos.length > 0 ? (
                            <div className="grid gap-3 sm:grid-cols-3">
                              {selectedItem.photos.map((photo) => (
                                <div className="rounded-xl border border-slate-200 p-2" key={photo.id}>
                                  <button
                                    className="w-full"
                                    onClick={() =>
                                      setExpandedPhoto({
                                        photos: selectedItem.photos.map((entry) => ({
                                          url: entry.url,
                                          fileName: entry.fileName,
                                        })),
                                        index: selectedItem.photos.findIndex((entry) => entry.id === photo.id),
                                      })
                                    }
                                    type="button"
                                  >
                                    <img alt={photo.fileName} className="h-24 w-full rounded-md object-cover" src={photo.url} />
                                  </button>
                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <span className="truncate text-xs text-slate-500">{photo.fileName}</span>
                                    <button className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50" onClick={() => { if (selectedItem) { void handleDeleteItemPhoto(selectedItem.id, photo.id); } }} type="button">Excluir</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {pendingItemPhotos.length > 0 ? <div className="text-xs text-slate-500">{pendingItemPhotos.length} foto(s) pronta(s) para envio.</div> : null}
                          <div className="text-xs text-slate-500">Formatos permitidos: PNG, JPG e JPEG. Tamanho máximo: 5 MB por arquivo.</div>
                          {renderPendingPhotoSlots(selectedItem?.photos.length ?? 0)}
                          <div className="flex justify-end">
                            <button
                              className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white"
                              disabled={submitting || pendingItemPhotos.length === 0 || !selectedItem}
                              onClick={async () => {
                                if (!selectedItem) return;
                                setSubmitting(true);
                                try {
                                  await uploadItemPhotos(selectedItem.id, pendingItemPhotos, selectedItem.photos.length);
                                  setPendingItemPhotos([]);
                                  setMessage("Fotos enviadas com sucesso.");
                                } catch {
                                  setMessage(undefined, "Não foi possível enviar as fotos.");
                                } finally {
                                  setSubmitting(false);
                                }
                              }}
                              type="button"
                            >
                              Enviar fotos
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {section.key === "movement" ? (
                        <div className="space-y-4">
                          <form className="grid gap-3 md:grid-cols-4" onSubmit={handleStockOperation}>
                            <select className="rounded-2xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setStockOperationForm((current) => ({ ...current, direction: event.target.value as "in" | "out" }))} value={stockOperationForm.direction}>
                              <option value="in">Entrada</option>
                              <option value="out">Saída</option>
                            </select>
                            <input className="rounded-2xl border border-slate-200 px-3 py-2 text-sm" min={1} onChange={(event) => setStockOperationForm((current) => ({ ...current, quantity: Number(event.target.value) }))} placeholder="Quantidade" type="number" value={stockOperationForm.quantity} />
                            <input className="rounded-2xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setStockOperationForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Motivo" required value={stockOperationForm.reason} />
                            <button className="rounded-full bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white" disabled={submitting} type="submit">{submitting ? "Registrando..." : "Registrar"}</button>
                            <textarea className="md:col-span-4 min-h-20 rounded-2xl border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setStockOperationForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Observações" value={stockOperationForm.notes} />
                          </form>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="border-b border-slate-200 text-left text-slate-500">
                                <tr>
                                  <th className="px-2 py-2">Tipo</th>
                                  <th className="px-2 py-2">Quantidade</th>
                                  <th className="px-2 py-2">Motivo</th>
                                  <th className="px-2 py-2">Data/Hora</th>
                                  <th className="px-2 py-2">Usuário</th>
                                </tr>
                              </thead>
                              <tbody>
                                {itemMovements.map((movement) => (
                                  <tr className="border-b border-slate-100" key={movement.id}>
                                    <td className="px-2 py-2">{movement.movementType === "stock_in" ? "Entrada" : movement.movementType === "stock_out" ? "Saída" : movement.movementType}</td>
                                    <td className="px-2 py-2">{movement.quantity}</td>
                                    <td className="px-2 py-2">{movement.reason}</td>
                                    <td className="px-2 py-2">{formatDateTime(movement.createdAt)}</td>
                                    <td className="px-2 py-2">{movement.performedBy?.name ?? movement.performedBy?.email ?? "Sistema"}</td>
                                  </tr>
                                ))}
                                {itemMovements.length === 0 ? (
                                  <tr>
                                    <td className="px-2 py-4 text-center text-slate-500" colSpan={5}>Sem movimentações registradas.</td>
                                  </tr>
                                ) : null}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Modal>
      ) : null}

      {dialogMode === "move-item" && (selectedItem || selectedItemIds.size > 0) ? (
        <Modal
          description={
            selectedItemIds.size > 1
              ? `Escolha a pasta de destino para ${selectedItemIds.size} itens selecionados.`
              : `Escolha a pasta de destino para ${selectedItem?.name ?? "o item selecionado"}.`
          }
          onClose={() => setDialogMode(null)}
          title={selectedItemIds.size > 1 ? "Mover itens" : "Mover item"}
        >
          <form className="space-y-4" onSubmit={handleMoveItem}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Destino</span>
              <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" onChange={(event) => setMoveItemFolderId(event.target.value)} value={moveItemFolderId}>
                {(selectedItemIds.size > 1 ? folders : moveItemOptions).map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-end">
              <button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white" disabled={submitting || !moveItemFolderId} type="submit">
                {submitting ? "Movendo..." : selectedItemIds.size > 1 ? "Mover itens" : "Mover item"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {dialogMode === "bulk-edit-items" ? (
        <Modal
          description={`Aplique os mesmos campos para ${selectedItemIds.size} itens selecionados. Campos vazios não serão alterados.`}
          onClose={() => setDialogMode(null)}
          title="Editar itens em massa"
        >
          <form className="space-y-4" onSubmit={handleBulkEditItems}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Descrição</span>
              <textarea
                className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3"
                onChange={(event) => setBulkEditForm((current) => ({ ...current, description: event.target.value }))}
                value={bulkEditForm.description}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Notas</span>
              <textarea
                className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3"
                onChange={(event) => setBulkEditForm((current) => ({ ...current, notes: event.target.value }))}
                value={bulkEditForm.notes}
              />
            </label>

            <div className="flex justify-end">
              <button className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm font-medium text-white" disabled={submitting} type="submit">
                {submitting ? "Salvando..." : `Atualizar ${selectedItemIds.size} ${selectedItemIds.size === 1 ? "item" : "itens"}`}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {dialogMode === "stock-out" ? (
        <Modal description="Registre uma saída de estoque com motivo e observacoes." onClose={() => setDialogMode(null)} title="Saida de estoque">
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

      {dialogMode === "delete-item" && selectedItem ? (
        <Modal description={`Confirme a exclusão do item ${selectedItem.name}. Esta ação é irreversível.`} onClose={() => setDialogMode(null)} title="Excluir item">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Este item será removido do Explorer e não poderá ser recuperado por esta interface.</p>
            <div className="flex justify-end gap-2">
              <button className="rounded-full border border-slate-200 px-5 py-2 text-sm" onClick={() => setDialogMode(null)} type="button">
                Cancelar
              </button>
              <button className="rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-700" disabled={submitting} onClick={() => { void handleDeleteItem(); }} type="button">
                {submitting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {dialogMode === "force-delete-folder" && pendingForceDeleteFolder ? (
        <Modal
          description={`Você está prestes a excluir a pasta ${pendingForceDeleteFolder.name} com todas as subpastas e itens.`}
          onClose={() => setDialogMode(null)}
          title="Confirmar exclusão completa"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Essa ação é irreversível. Tem certeza que deseja continuar?</p>
            <div className="flex justify-end gap-2">
              <button className="rounded-full border border-slate-200 px-5 py-2 text-sm" onClick={() => setDialogMode(null)} type="button">
                Cancelar
              </button>
              <button
                className="rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-700"
                disabled={submitting}
                onClick={() => {
                  void handleForceDeleteFolder();
                }}
                type="button"
              >
                {submitting ? "Excluindo..." : "Excluir tudo"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {expandedPhoto ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4"
          onClick={() => setExpandedPhoto(null)}
          role="presentation"
        >
          <div className="max-h-[90vh] max-w-[90vw]" onClick={(event) => event.stopPropagation()} role="presentation">
            <img
              alt={expandedPhoto.photos[expandedPhoto.index]?.fileName ?? "Foto"}
              className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
              src={expandedPhoto.photos[expandedPhoto.index]?.url}
            />
            <div className="mt-2 flex items-center justify-center gap-3">
              <button
                className="rounded-full border border-slate-400 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800"
                disabled={expandedPhoto.index <= 0}
                onClick={() =>
                  setExpandedPhoto((current) =>
                    current
                      ? {
                          ...current,
                          index: Math.max(0, current.index - 1),
                        }
                      : current,
                  )
                }
                type="button"
              >
                Anterior
              </button>
              <div className="text-center text-xs text-slate-200">
                {expandedPhoto.photos[expandedPhoto.index]?.fileName}
                <div className="text-[11px] text-slate-400">
                  {expandedPhoto.index + 1} de {expandedPhoto.photos.length}
                </div>
              </div>
              <button
                className="rounded-full border border-slate-400 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800"
                disabled={expandedPhoto.index >= expandedPhoto.photos.length - 1}
                onClick={() =>
                  setExpandedPhoto((current) =>
                    current
                      ? {
                          ...current,
                          index: Math.min(current.photos.length - 1, current.index + 1),
                        }
                      : current,
                  )
                }
                type="button"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
