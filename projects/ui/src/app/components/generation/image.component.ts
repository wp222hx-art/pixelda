import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { lastValueFrom } from 'rxjs';
import {
  GenerationService,
  ImageGenerationRequest,
  ImageEditRequest,
  GenerationResponse,
  PromptGenerationRequest,
} from '../../services/generation.service';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-image',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './image.component.html',
  styleUrls: ['./image.component.scss'],
})
export class ImageComponent implements OnInit, OnDestroy {
  // Simple worldview input
  worldviewHint = '';

  // Generated prompt from AI
  generatedPrompt = signal('');

  // Parameters
  size = '1024*1024';

  // Tabs
  activeTab = 'generate';

  // Edit mode
  imageUrl = '';
  editPrompt = '';

  // State
  result = signal<GenerationResponse | null>(null);
  loading = signal(false);
  promptLoading = signal(false);
  imageLoading = signal(false);

  // Example worldview hints for placeholder rotation
  exampleHints: string[] = [];

  constructor(
    private generationService: GenerationService,
    private settingService: SettingsService,
    private router: Router,
    private translate: TranslateService
  ) {}

  ngOnInit() {
    this.loadFormData();
    this.loadExampleHints();
    this.translate.onLangChange.subscribe(() => this.loadExampleHints());
  }

  ngOnDestroy() {
    this.saveFormData();
  }

  private loadExampleHints() {
    const lang = this.translate.currentLang || 'en';
    if (lang === 'zh') {
      this.exampleHints = [
        '赛博朋克废土',
        '中世纪魔法森林',
        '深海遗迹',
        '蒸汽朋克空中城堡',
        '像素风日式庭院',
        '末日后的地下城',
      ];
    } else {
      this.exampleHints = [
        'Cyberpunk wasteland',
        'Medieval magic forest',
        'Deep sea ruins',
        'Steampunk sky castle',
        'Pixel-style Japanese garden',
        'Post-apocalyptic dungeon',
      ];
    }
  }

  getRandomPlaceholder(): string {
    if (!this.exampleHints.length) return '';
    const idx = Math.floor(Math.random() * this.exampleHints.length);
    return this.exampleHints[idx];
  }

  setActiveTab(tab: 'generate' | 'edit') {
    this.activeTab = tab;
    this.saveFormData();
  }

  private saveFormData() {
    const formData = {
      worldviewHint: this.worldviewHint,
      generatedPrompt: this.generatedPrompt(),
      size: this.size,
      activeTab: this.activeTab,
      imageUrl: this.imageUrl,
      editPrompt: this.editPrompt,
    };
    localStorage.setItem('pixelda_image_form', JSON.stringify(formData));
  }

  private loadFormData() {
    const savedData = localStorage.getItem('pixelda_image_form');
    if (savedData) {
      try {
        const formData = JSON.parse(savedData);
        this.worldviewHint = formData.worldviewHint || '';
        this.generatedPrompt.set(formData.generatedPrompt || '');
        this.size = formData.size || '1024*1024';
        this.activeTab = formData.activeTab || 'generate';
        this.imageUrl = formData.imageUrl || '';
        this.editPrompt = formData.editPrompt || '';
      } catch (error) {
        localStorage.removeItem('pixelda_image_form');
      }
    }
  }

  async generateWithAI() {
    this.promptLoading.set(true);
    this.loading.set(true);
    this.imageLoading.set(true);
    this.result.set(null);

    try {
      // Step 1: Generate prompt via built-in AI (no user API key needed)
      const promptRequest: PromptGenerationRequest = {
        idea: this.worldviewHint.trim() || undefined,
        model_type: this.settingService.getActiveModel(),
      };

      const promptResult = await lastValueFrom(
        this.generationService.generatePrompt(promptRequest)
      );

      if (promptResult.error_info) {
        this.result.set({
          url: '',
          error_info: promptResult.error_info,
        });
        this.loading.set(false);
        this.promptLoading.set(false);
        this.imageLoading.set(false);
        return;
      }

      this.generatedPrompt.set(promptResult.prompt);
      this.promptLoading.set(false);
      this.saveFormData();

      // Step 2: Generate image with that prompt (needs user API key)
      if (!this.settingService.hasAnyApiKey()) {
        this.loading.set(false);
        this.imageLoading.set(false);
        this.result.set({
          url: '',
          error_info: this.getNoApiKeyMessage(),
        });
        return;
      }
      this.doGenerateImage(promptResult.prompt);
    } catch (error: any) {
      this.result.set({
        url: '',
        error_info: error.message || 'Failed to generate prompt',
      });
      this.loading.set(false);
      this.promptLoading.set(false);
      this.imageLoading.set(false);
    }
  }

  generateFromPrompt() {
    if (!this.settingService.hasAnyApiKey()) {
      this.result.set({
        url: '',
        error_info: this.getNoApiKeyMessage(),
      });
      return;
    }

    const prompt = this.generatedPrompt().trim();
    if (!prompt) return;
    this.loading.set(true);
    this.imageLoading.set(true);
    this.result.set(null);
    this.doGenerateImage(prompt);
  }

  private doGenerateImage(prompt: string) {
    const request: ImageGenerationRequest = {
      prompt,
      size: this.size,
      task_id: this.generationService.generateTaskId('img'),
      model_type: this.settingService.getActiveModel(),
    };

    this.generationService.generateImage(request).subscribe({
      next: (result) => {
        this.result.set(result);
        this.loading.set(false);
        if (result.url && !result.error_info) {
          this.storeGenerationToHistory(result, prompt);
        }
      },
      error: (error) => {
        this.result.set({
          url: '',
          task_id: request.task_id,
          error_info: error.message,
        });
        this.loading.set(false);
        this.imageLoading.set(false);
      },
    });
  }

  editImage() {
    if (!this.settingService.hasAnyApiKey()) {
      this.result.set({
        url: '',
        error_info: this.getNoApiKeyMessage(),
      });
      return;
    }

    if (!this.imageUrl.trim()) return;
    const prompt = this.editPrompt.trim();
    if (!prompt) return;

    this.loading.set(true);
    this.imageLoading.set(true);

    const request: ImageEditRequest = {
      image_url: this.imageUrl,
      prompt: prompt,
      task_id: this.generationService.generateTaskId('img_edit'),
      model_type: this.settingService.getActiveModel(),
      size: this.size,
    };

    this.generationService.editImage(request).subscribe({
      next: (result) => {
        this.result.set(result);
        this.loading.set(false);
        if (result.url && !result.error_info) {
          this.storeGenerationToHistory(result, prompt);
        }
      },
      error: (error) => {
        this.result.set({
          url: '',
          task_id: request.task_id,
          error_info: error.message,
        });
        this.loading.set(false);
        this.imageLoading.set(false);
      },
    });
  }

  clearForm() {
    this.worldviewHint = '';
    this.generatedPrompt.set('');
    this.size = '1024*1024';
    this.activeTab = 'generate';
    this.imageUrl = '';
    this.editPrompt = '';
    this.result.set(null);
    localStorage.removeItem('pixelda_image_form');
  }

  regenerateImage() {
    this.generateWithAI();
  }

  navigateToAnimation() {
    if (this.result() && this.result()!.url) {
      localStorage.setItem('pixelda_animation_image_url', this.result()!.url);
      this.router.navigate(['/generate/animation']);
    }
  }

  sendToPlayground() {
    if (this.result() && this.result()!.url) {
      const assetData = {
        url: this.result()!.url,
        name: this.generatedPrompt()
          ? this.generatedPrompt().substring(0, 30)
          : `Image_${Date.now()}`,
        type: 'character',
      };
      localStorage.setItem('pixelda_playground_import', JSON.stringify(assetData));
      this.router.navigate(['/generate/playground']);
    }
  }

  editGeneratedImage() {
    if (this.result() && this.result()!.url) {
      const imageUrl = this.result()!.url;
      this.result.set(null);
      this.imageLoading.set(false);
      this.setActiveTab('edit');
      this.imageUrl = imageUrl;
      this.editPrompt = '';
      this.saveFormData();
    }
  }

  onImageLoad() {
    this.imageLoading.set(false);
  }

  onImageError() {
    this.imageLoading.set(false);
  }

  onThumbnailError() {}

  private getNoApiKeyMessage(): string {
    const lang = this.translate.currentLang || 'en';
    return lang === 'zh'
      ? '请先在设置页面配置 API Key'
      : 'Please configure your API Key in Settings first';
  }

  private storeGenerationToHistory(result: GenerationResponse, prompt: string) {
    const historyItem = {
      id: result.task_id || `img_${Date.now()}`,
      type: 'image',
      url: result.url,
      prompt: prompt,
      timestamp: new Date().toISOString(),
      size: this.size,
    };

    const existingHistory = localStorage.getItem('pixelda_generation_history');
    let history: any[] = [];

    if (existingHistory) {
      try {
        history = JSON.parse(existingHistory);
      } catch (error) {
        history = [];
      }
    }

    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000;
    history = history.filter((item) => {
      const itemDate = new Date(item.timestamp);
      return now.getTime() - itemDate.getTime() <= maxAge;
    });

    history.unshift(historyItem);
    if (history.length > 50) {
      history = history.slice(0, 50);
    }

    localStorage.setItem('pixelda_generation_history', JSON.stringify(history));
  }
}
