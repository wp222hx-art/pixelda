import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface PromptGenerationRequest {
  idea?: string;
  model_type?: string;
}

export interface AnimationPromptRequest {
  image_url?: string;
  motion_hint?: string;
  model_type?: string;
}

export interface PromptGenerationResponse {
  prompt: string;
  error_info?: string;
}

export interface ImageGenerationRequest {
  task_id: string;
  prompt: string;
  negative_prompt?: string;
  size?: string;
  seed?: number;
  model_type?: string;
}

export interface ImageEditRequest {
  task_id: string;
  image_url: string;
  prompt: string;
  negative_prompt?: string;
  size?: string;
  seed?: number;
  model_type?: string;
}

export interface VideoGenerationRequest {
  task_id: string;
  base_image_url: string;
  prompt: string;
  negative_prompt?: string;
  resolution?: string;
  model_type?: string;
}

export interface FrameSplitRequest {
  task_id: string;
  video_url: string;
  from_time: number;
  to_time: number;
  count: number;
}

export interface FrameSplitResponse {
  frames: string[];
  task_id: string;
  error_info?: string;
}

export interface ZipFramesRequest {
  name: string;
  frame_urls: string[];
  removebg?: boolean;
  output_type?: string;
}

export interface MusicGenerationRequest {
  task_id: string;
  prompt: string;
  duration?: number;
  genre?: string;
  tempo?: string;
  seed?: number;
  model_type?: string;
}

export interface MusicResponse {
  original: string;
  chiptune: string;
  task_id?: string;
  error_info?: string;
}

export interface GenerationResponse {
  url: string;
  task_id?: string;
  error_info?: string;
}

@Injectable({
  providedIn: 'root',
})
export class GenerationService {
  private apiUrl = '/api';

  constructor(private http: HttpClient) {}

  generatePrompt(request: PromptGenerationRequest): Observable<PromptGenerationResponse> {
    return this.http
      .post<PromptGenerationResponse>(`${this.apiUrl}/generate/prompt`, request)
      .pipe(catchError(this.handleError));
  }

  generateAnimationPrompt(request: AnimationPromptRequest): Observable<PromptGenerationResponse> {
    return this.http
      .post<PromptGenerationResponse>(`${this.apiUrl}/generate/animation-prompt`, request)
      .pipe(catchError(this.handleError));
  }

  generateImage(request: ImageGenerationRequest): Observable<GenerationResponse> {
    return this.http
      .post<GenerationResponse>(`${this.apiUrl}/generate/image`, request)
      .pipe(catchError(this.handleError));
  }

  editImage(request: ImageEditRequest): Observable<GenerationResponse> {
    return this.http
      .post<GenerationResponse>(`${this.apiUrl}/edit/image`, request)
      .pipe(catchError(this.handleError));
  }

  generateVideo(request: VideoGenerationRequest): Observable<GenerationResponse> {
    return this.http
      .post<GenerationResponse>(`${this.apiUrl}/generate/video`, request)
      .pipe(catchError(this.handleError));
  }

  splitVideoFrames(request: FrameSplitRequest): Observable<FrameSplitResponse> {
    return this.http
      .post<FrameSplitResponse>(`${this.apiUrl}/generate/video_split_frames`, request)
      .pipe(catchError(this.handleError));
  }

  zipFrames(request: ZipFramesRequest): Observable<Blob> {
    return this.http
      .post(`${this.apiUrl}/frames/zip`, request, { responseType: 'blob' })
      .pipe(catchError(this.handleError));
  }

  generateMusic(request: MusicGenerationRequest): Observable<MusicResponse> {
    return this.http
      .post<MusicResponse>(`${this.apiUrl}/generate/music`, request)
      .pipe(catchError(this.handleError));
  }

  generateTaskId(prefix: string): string {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${randomSuffix}`;
  }

  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'An unknown error occurred!';
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else if (error.error && typeof error.error === 'object' && error.error.detail) {
      // FastAPI-style error response: {"detail": "..."}
      errorMessage = error.error.detail;
    } else if (error.error && typeof error.error === 'string') {
      errorMessage = error.error;
    } else {
      errorMessage = `Error ${error.status}: ${error.statusText || 'Request failed'}`;
    }
    console.error('API Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}
