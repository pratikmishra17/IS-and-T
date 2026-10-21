import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '../../services/auth';
import { errorMessage } from '../../services/errors';
import { PortalApi, StockLookup } from '../../services/portal';

/** User portal: Inventory (/inventory). Read-only: find an item and see which room has it. */
@Component({
  selector: 'app-inventory',
  imports: [FormsModule],
  templateUrl: './inventory.html',
})
export class Inventory implements OnInit {
  private readonly api = inject(PortalApi);
  protected readonly auth = inject(Auth);

  protected readonly items = signal<StockLookup[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly category = signal('all');

  protected readonly categories = computed(() => [...new Set((this.items() ?? []).map((item) => item.category))].sort());
  protected readonly shown = computed(() => {
    const query = this.search().trim().toLowerCase();
    return (this.items() ?? [])
      .filter((item) => this.category() === 'all' || item.category === this.category())
      .filter((item) => !query || [item.name, item.category, item.manufacturer ?? '', item.model ?? '', ...Object.values(item.details)]
        .some((value) => value.toLowerCase().includes(query)));
  });

  async ngOnInit(): Promise<void> {
    try {
      this.items.set(await this.api.stock());
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
