import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8080/api';

  health() {
    return this.http.get(`${this.baseUrl}/health`, { responseType: 'text' });
  }
}
