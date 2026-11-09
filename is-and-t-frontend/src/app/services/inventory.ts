import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Category {
  id: number;
  name: string;
  itemCount: number;
}

export interface StorageLocation {
  id: number;
  building: string;
  room: string;
  description: string | null;
  /** "Rhodes Tower 1408" */
  label: string;
  unitsStored: number;
  /** Stock moved here, or a task planned items from here: it can't be deleted. */
  hasHistory: boolean;
}

export type LocationDetails = Pick<StorageLocation, 'building' | 'room' | 'description'>;

export interface Item {
  id: number;
  categoryId: number;
  categoryName: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  trackingType: 'COUNT' | 'SERIALIZED';
  lowStockThreshold: number;
  attributes: Record<string, string>;
  archived: boolean;
  onHand: number;
  /** Set aside for planned deployments (0 until Tasks exist). */
  reserved: number;
  available: number;
  lowStock: boolean;
  stock: { locationId: number; label: string; quantity: number }[];
  /** Stock moved, or a task used it: it can only be archived, not deleted. */
  hasHistory: boolean;
}

export interface ItemDetails {
  categoryId: number | null;
  name: string;
  manufacturer: string;
  model: string;
  lowStockThreshold: number;
  attributes: Record<string, string>;
  /** Adding only: its first stock, in this room. */
  startingQuantity?: number | null;
  startingLocationId?: number | null;
}

/** MOVE takes stock from the room to another room (toLocationId). */
export type AdjustmentType = 'ADD' | 'REMOVE' | 'SET' | 'MOVE';

export interface Transaction {
  id: number;
  itemId: number;
  itemName: string;
  locationLabel: string;
  delta: number;
  reason: 'RESTOCK' | 'REMOVAL' | 'ADJUSTMENT' | 'DEPLOYMENT' | 'MOVE';
  note: string | null;
  byName: string | null;
  occurredAt: string;
}

const BASE = '/api/admin/inventory';

/** Admin portal: inventory calls. */
@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly http = inject(HttpClient);

  categories(): Promise<Category[]> {
    return firstValueFrom(this.http.get<Category[]>(`${BASE}/categories`));
  }

  saveCategory(name: string, id?: number): Promise<Category> {
    return firstValueFrom(id
      ? this.http.put<Category>(`${BASE}/categories/${id}`, { name })
      : this.http.post<Category>(`${BASE}/categories`, { name }));
  }

  async deleteCategory(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${BASE}/categories/${id}`));
  }

  locations(): Promise<StorageLocation[]> {
    return firstValueFrom(this.http.get<StorageLocation[]>(`${BASE}/locations`));
  }

  saveLocation(details: LocationDetails, id?: number): Promise<StorageLocation> {
    return firstValueFrom(id
      ? this.http.put<StorageLocation>(`${BASE}/locations/${id}`, details)
      : this.http.post<StorageLocation>(`${BASE}/locations`, details));
  }

  async deleteLocation(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${BASE}/locations/${id}`));
  }

  items(): Promise<Item[]> {
    return firstValueFrom(this.http.get<Item[]>(`${BASE}/items`));
  }

  saveItem(details: ItemDetails, id?: number): Promise<Item> {
    return firstValueFrom(id
      ? this.http.put<Item>(`${BASE}/items/${id}`, details)
      : this.http.post<Item>(`${BASE}/items`, details));
  }

  setArchived(id: number, archived: boolean): Promise<Item> {
    return firstValueFrom(this.http.post<Item>(`${BASE}/items/${id}/${archived ? 'archive' : 'restore'}`, null));
  }

  async deleteItem(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${BASE}/items/${id}`));
  }

  adjustStock(itemId: number, locationId: number, type: AdjustmentType, quantity: number, note: string, toLocationId?: number | null): Promise<Item> {
    return firstValueFrom(this.http.post<Item>(`${BASE}/stock`, { itemId, locationId, type, quantity, note, toLocationId: toLocationId ?? null }));
  }

  /** Newest first; for one item when itemId is given. */
  transactions(itemId?: number): Promise<Transaction[]> {
    const params: Record<string, string> = itemId ? { itemId: String(itemId) } : {};
    return firstValueFrom(this.http.get<Transaction[]>(`${BASE}/transactions`, { params }));
  }
}
