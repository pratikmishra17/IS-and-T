import { DatePipe, KeyValuePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { errorMessage } from '../../../services/errors';
import { AdjustmentType, Category, InventoryApi, Item, ItemDetails, LocationDetails, StorageLocation, Transaction } from '../../../services/inventory';
import { Confirm } from '../../../ui/confirm';
import { SidePanel } from '../../../ui/side-panel';
import { Toasts } from '../../../ui/toast';
import { remembered } from '../../../services/remember';

type Tab = 'items' | 'rooms' | 'categories' | 'history';

/** One "name: value" row of an item's optional extra fields while editing. */
interface AttributeRow {
  key: string;
  value: string;
}

/** Admin portal: Inventory (/admin/inventory). Items and their stock per room, rooms, categories, history. */
@Component({
  selector: 'app-admin-inventory',
  imports: [DatePipe, KeyValuePipe, NgTemplateOutlet, FormsModule, SidePanel],
  templateUrl: './inventory.html',
})
export class AdminInventory implements OnInit {
  private readonly api = inject(InventoryApi);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);

  protected readonly tab = remembered<Tab>('inventory.tab', 'items', { allowed: ['items', 'rooms', 'categories', 'history'] });
  protected readonly loading = signal(true);
  protected readonly items = signal<Item[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly locations = signal<StorageLocation[]>([]);
  protected readonly history = signal<Transaction[]>([]);

  // Items tab filters
  protected readonly search = remembered('inventory.search', '', { session: true });
  protected readonly categoryFilter = remembered<number | 'all'>('inventory.category', 'all');
  protected readonly lowStockOnly = signal(false);
  protected readonly showArchived = signal(false);

  protected readonly shownItems = computed(() => {
    const query = this.search().trim().toLowerCase();
    const category = this.categoryFilter();
    return this.items()
      .filter((item) => this.showArchived() || !item.archived)
      .filter((item) => category === 'all' || item.categoryId === category)
      .filter((item) => !this.lowStockOnly() || (item.lowStock && !item.archived))
      .filter((item) => !query || [item.name, item.manufacturer ?? '', item.model ?? '', item.categoryName]
        .some((value) => value.toLowerCase().includes(query)));
  });
  protected readonly lowStockCount = computed(() => this.items().filter((item) => item.lowStock && !item.archived).length);

  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly busyId = signal<number | null>(null);

  // Item panel (add / edit)
  protected readonly itemPanelOpen = signal(false);
  protected readonly editingItem = signal<Item | null>(null);
  protected itemDraft: ItemDetails = this.emptyItem();
  protected attributeRows: AttributeRow[] = [];

  // Stock panel
  protected readonly stockItem = signal<Item | null>(null);
  protected stockDraft: { locationId: number | null; type: AdjustmentType; quantity: number | null; note: string; toLocationId: number | null } = this.emptyStock();

  // Item history panel
  protected readonly historyItem = signal<Item | null>(null);
  protected readonly itemHistory = signal<Transaction[]>([]);

  // Room panel
  protected readonly roomPanelOpen = signal(false);
  protected readonly editingRoom = signal<StorageLocation | null>(null);
  protected roomDraft: LocationDetails = { building: '', room: '', description: '' };

  // Category panel
  protected readonly categoryPanelOpen = signal(false);
  protected readonly editingCategory = signal<Category | null>(null);
  protected categoryDraft = '';
  /** The "new category" box at the top of the Categories tab. */
  protected newCategory = '';
  protected readonly newCategoryError = signal<string | null>(null);
  protected readonly addingCategory = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      await this.reloadAll();
      if (this.tab() === 'history') {
        this.history.set(await this.api.transactions()); // the remembered tab needs its data too
      }
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async switchTab(tab: Tab): Promise<void> {
    this.tab.set(tab);
    if (tab === 'history') {
      await this.guard(async () => this.history.set(await this.api.transactions()));
    }
  }

  // ---- Items ----

  protected openAddItem(): void {
    this.editingItem.set(null);
    this.itemDraft = this.emptyItem();
    const category = this.categoryFilter();
    this.itemDraft.categoryId = category === 'all' ? (this.categories()[0]?.id ?? null) : category;
    this.attributeRows = [];
    this.formError.set(null);
    this.itemPanelOpen.set(true);
  }

  protected openEditItem(item: Item): void {
    this.editingItem.set(item);
    this.itemDraft = {
      categoryId: item.categoryId, name: item.name, manufacturer: item.manufacturer ?? '', model: item.model ?? '',
      lowStockThreshold: item.lowStockThreshold, attributes: {},
    };
    this.attributeRows = Object.entries(item.attributes).map(([key, value]) => ({ key, value }));
    this.formError.set(null);
    this.itemPanelOpen.set(true);
  }

  protected addAttributeRow(): void {
    this.attributeRows = [...this.attributeRows, { key: '', value: '' }];
  }

  protected removeAttributeRow(row: AttributeRow): void {
    this.attributeRows = this.attributeRows.filter((other) => other !== row);
  }

  protected async saveItem(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    const editing = this.editingItem();
    const attributes = Object.fromEntries(this.attributeRows.filter((row) => row.key.trim() && row.value.trim())
      .map((row) => [row.key.trim(), row.value.trim()]));
    await this.submit(async () => {
      const saved = await this.api.saveItem({ ...this.itemDraft, attributes }, editing?.id);
      this.upsertItem(saved);
      this.categories.set(await this.api.categories());
      this.itemPanelOpen.set(false);
      this.toasts.success(editing ? `${saved.name} was saved.` : `${saved.name} was added. Use “Adjust stock” to record how many you have.`);
    });
  }

  protected async archiveItem(item: Item): Promise<void> {
    if (!item.archived) {
      const ok = await this.confirm.ask({
        title: `Archive ${item.name}?`,
        message: item.onHand > 0
          ? `It still has ${item.onHand} in stock. Archived items are hidden from the lists, but their history is kept and you can restore them.`
          : 'Archived items are hidden from the lists, but their history is kept and you can restore them.',
        confirmLabel: 'Archive',
      });
      if (!ok) {
        return;
      }
    }
    await this.rowAction(item.id, async () => {
      this.upsertItem(await this.api.setArchived(item.id, !item.archived));
      this.toasts.success(`${item.name} was ${item.archived ? 'restored' : 'archived'}.`);
    });
  }

  protected async deleteItem(item: Item): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete ${item.name}?`,
      message: 'Only items that never had stock can be deleted. This can’t be undone.',
      confirmLabel: 'Delete item',
      danger: true,
    });
    if (ok) {
      await this.rowAction(item.id, async () => {
        await this.api.deleteItem(item.id);
        this.items.update((all) => all.filter((other) => other.id !== item.id));
        this.categories.set(await this.api.categories());
        this.toasts.success(`${item.name} was deleted.`);
      });
    }
  }

  // ---- Stock ----

  protected openStock(item: Item): void {
    this.stockItem.set(item);
    this.stockDraft = this.emptyStock();
    this.stockDraft.locationId = item.stock[0]?.locationId ?? this.locations()[0]?.id ?? null;
    this.formError.set(null);
  }

  /** How many of the stock panel's item are in the chosen room right now. */
  protected stockInRoom(): number {
    return this.stockItem()?.stock.find((s) => s.locationId === this.stockDraft.locationId)?.quantity ?? 0;
  }

  /** What the room will have after saving, for the live preview (null while it isn't a valid change). */
  protected stockAfter(): number | null {
    const quantity = this.stockDraft.quantity;
    if (quantity === null || quantity < 0) {
      return null;
    }
    const current = this.stockInRoom();
    if (this.stockDraft.type === 'MOVE' && (quantity === 0 || !this.stockDraft.toLocationId || this.stockDraft.toLocationId === this.stockDraft.locationId)) {
      return null; // a move needs a number and a different room
    }
    const after = this.stockDraft.type === 'ADD' ? current + quantity
      : this.stockDraft.type === 'SET' ? quantity : current - quantity; // REMOVE and MOVE take them out of this room
    return after < 0 ? null : after;
  }

  /** For a move: how many the other room will have. */
  protected stockInTarget(): number {
    const target = this.stockItem()?.stock.find((s) => s.locationId === this.stockDraft.toLocationId)?.quantity ?? 0;
    return target + (this.stockDraft.quantity ?? 0);
  }

  protected locationLabel(id: number | null): string {
    return this.locations().find((location) => location.id === id)?.label ?? '';
  }

  protected async saveStock(form: NgForm): Promise<void> {
    const item = this.stockItem();
    if (form.invalid || !item || this.stockDraft.locationId === null || this.stockDraft.quantity === null) {
      form.control.markAllAsTouched();
      return;
    }
    await this.submit(async () => {
      const saved = await this.api.adjustStock(item.id, this.stockDraft.locationId!, this.stockDraft.type,
        this.stockDraft.quantity!, this.stockDraft.note, this.stockDraft.type === 'MOVE' ? this.stockDraft.toLocationId : null);
      this.upsertItem(saved);
      this.locations.set(await this.api.locations());
      this.stockItem.set(null);
      this.toasts.success(`${saved.name}: ${saved.onHand} in stock in total.`);
    });
  }

  protected async openHistory(item: Item): Promise<void> {
    this.itemHistory.set([]);
    this.historyItem.set(item);
    await this.guard(async () => this.itemHistory.set(await this.api.transactions(item.id)));
  }

  protected reasonLabel(reason: Transaction['reason']): string {
    return { RESTOCK: 'Added', REMOVAL: 'Removed', ADJUSTMENT: 'Count corrected', DEPLOYMENT: 'Used in deployment', MOVE: 'Moved' }[reason];
  }

  // ---- Rooms ----

  protected openRoom(room?: StorageLocation): void {
    this.editingRoom.set(room ?? null);
    this.roomDraft = { building: room?.building ?? '', room: room?.room ?? '', description: room?.description ?? '' };
    this.formError.set(null);
    this.roomPanelOpen.set(true);
  }

  protected async saveRoom(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    const editing = this.editingRoom();
    await this.submit(async () => {
      const saved = await this.api.saveLocation(this.roomDraft, editing?.id);
      this.locations.set(await this.api.locations());
      if (editing) {
        this.items.set(await this.api.items());
      }
      this.roomPanelOpen.set(false);
      this.toasts.success(`${saved.label} was ${editing ? 'saved' : 'added'}.`);
    });
  }

  protected async deleteRoom(room: StorageLocation): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete ${room.label}?`,
      message: 'Only rooms that never held stock can be deleted. This can’t be undone.',
      confirmLabel: 'Delete room',
      danger: true,
    });
    if (ok) {
      await this.rowAction(room.id, async () => {
        await this.api.deleteLocation(room.id);
        this.locations.update((all) => all.filter((other) => other.id !== room.id));
        this.toasts.success(`${room.label} was deleted.`);
      });
    }
  }

  // ---- Categories ----

  protected focusNewCategory(): void {
    document.querySelector<HTMLInputElement>('#new-category')?.focus();
  }

  protected async addCategoryInline(): Promise<void> {
    const name = this.newCategory.trim();
    if (!name) {
      return;
    }
    this.addingCategory.set(true);
    this.newCategoryError.set(null);
    try {
      const saved = await this.api.saveCategory(name);
      this.categories.set(await this.api.categories());
      this.newCategory = '';
      this.toasts.success(`${saved.name} was added.`);
      this.focusNewCategory(); // ready for the next one
    } catch (error) {
      this.newCategoryError.set(errorMessage(error));
    } finally {
      this.addingCategory.set(false);
    }
  }

  protected openCategory(category?: Category): void {
    this.editingCategory.set(category ?? null);
    this.categoryDraft = category?.name ?? '';
    this.formError.set(null);
    this.categoryPanelOpen.set(true);
  }

  protected async saveCategory(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    const editing = this.editingCategory();
    await this.submit(async () => {
      const saved = await this.api.saveCategory(this.categoryDraft, editing?.id);
      this.categories.set(await this.api.categories());
      if (editing) {
        this.items.set(await this.api.items());
      }
      this.categoryPanelOpen.set(false);
      this.toasts.success(`${saved.name} was ${editing ? 'renamed' : 'added'}.`);
    });
  }

  protected async deleteCategory(category: Category): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete ${category.name}?`,
      message: 'Only empty categories can be deleted.',
      confirmLabel: 'Delete category',
      danger: true,
    });
    if (ok) {
      await this.rowAction(category.id, async () => {
        await this.api.deleteCategory(category.id);
        this.categories.update((all) => all.filter((other) => other.id !== category.id));
        this.toasts.success(`${category.name} was deleted.`);
      });
    }
  }

  // ---- Helpers ----

  private async reloadAll(): Promise<void> {
    const [items, categories, locations] = await Promise.all([this.api.items(), this.api.categories(), this.api.locations()]);
    this.items.set(items);
    this.categories.set(categories);
    this.locations.set(locations);
  }

  /** Puts a saved item into the list, replacing its old copy, keeping the list's order. */
  private upsertItem(saved: Item): void {
    this.items.update((all) => all.some((item) => item.id === saved.id)
      ? all.map((item) => (item.id === saved.id ? saved : item))
      : [...all, saved]);
  }

  /** A save from a side panel: on failure the panel stays open and shows why. */
  private async submit(action: () => Promise<void>): Promise<void> {
    this.saving.set(true);
    this.formError.set(null);
    try {
      await action();
    } catch (error) {
      this.formError.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** An action on one table row: disables that row's buttons while it runs; errors become a toast. */
  private async rowAction(id: number, action: () => Promise<void>): Promise<void> {
    this.busyId.set(id);
    await this.guard(action);
    this.busyId.set(null);
  }

  private async guard(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  private emptyItem(): ItemDetails {
    return { categoryId: null, name: '', manufacturer: '', model: '', lowStockThreshold: 0, attributes: {}, startingQuantity: null, startingLocationId: this.locations()[0]?.id ?? null };
  }

  private emptyStock(): { locationId: number | null; type: AdjustmentType; quantity: number | null; note: string; toLocationId: number | null } {
    return { locationId: null, type: 'ADD', quantity: null, note: '', toLocationId: null };
  }
}
