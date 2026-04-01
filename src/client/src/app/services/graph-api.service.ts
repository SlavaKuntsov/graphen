import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { GenerateResult, GraphenProject, ProjectGraph } from '../models/graph.models';

@Injectable({ providedIn: 'root' })
export class GraphApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/graph';

  loadProject(path?: string): Observable<GraphenProject> {
    let params = new HttpParams();
    if (path) {
      params = params.set('path', path);
    }
    return this.http.get<GraphenProject>(`${this.baseUrl}/load`, { params });
  }

  generate(graph: ProjectGraph): Observable<GenerateResult> {
    return this.http.post<GenerateResult>(`${this.baseUrl}/generate`, graph);
  }
}
