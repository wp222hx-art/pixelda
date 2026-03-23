import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { lastValueFrom } from 'rxjs';
import {
  GenerationService,
  VideoGenerationRequest,
  GenerationResponse,
  AnimationPromptRequest,
} from '../../services/generation.service';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-animation',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './animation.component.html',
  styleUrls: ['./animation.component.scss'],
})
export class AnimationComponent implements OnInit, OnDestroy {
  imageUrl = signal('');
  resolution: string = '480P';

  // Simple motion hint
  motionHint = '';

  // AI generated prompt
  generatedPrompt = signal('');

  // Local image handling
  isLocalImage = signal(false);
  displayImageUrl = signal('');
  fileName = signal('');

  result = signal<GenerationResponse | null>(null);

  isGenerating = signal(false);
  promptLoading = signal(false);
  errorMessage = signal('');

  // Motion hint examples
  motionExamples: string[] = [];

  constructor(
    private generationService: GenerationService,
    private settingService: SettingsService,
    private router: Router,
    private translate: TranslateService
  ) {}

  ngOnInit() {
    this.loadFormData();
    this.loadMotionExamples();
    this.translate.onLangChange.subscribe(() => this.loadMotionExamples());

    const passedImageUrl = localStorage.getItem('pixelda_animation_image_url');
    if (passedImageUrl) {
      this.imageUrl.set(passedImageUrl);
      localStorage.removeItem('pixelda_animation_image_url');
      this.isLocalImage.set(this.imageUrl().startsWith('data:'));
      this.displayImageUrl.set(
        this.isLocalImage() ? this.fileName() || 'local image' : this.imageUrl()
      );
      this.saveFormData();
    }
  }

  ngOnDestroy() {
    this.saveFormData();
  }

  private loadMotionExamples() {
    const lang = this.translate.currentLang || 'en';
    if (lang === 'zh') {
      this.motionExamples = ['攻击挥砍', '奔跑冲刺', '待机呼吸', '施法蓄能', '跳跃翻滚', '飞行滑翔'];
    } else {
      this.motionExamples = ['Attack slash', 'Run sprint', 'Idle breathing', 'Cast spell', 'Jump roll', 'Fly glide'];
    }
  }

  private saveFormData() {
    const formData = {
      imageUrl: this.imageUrl(),
      motionHint: this.motionHint,
      generatedPrompt: this.generatedPrompt(),
      resolution: this.resolution,
      fileName: this.fileName(),
    };
    localStorage.setItem('pixelda_animation_form', JSON.stringify(formData));
  }

  private loadFormData() {
    const savedData = localStorage.getItem('pixelda_animation_form');
    if (savedData) {
      try {
        const formData = JSON.parse(savedData);
        this.imageUrl.set(formData.imageUrl || '');
        this.motionHint = formData.motionHint || '';
        this.generatedPrompt.set(formData.generatedPrompt || '');
        this.resolution = formData.resolution || '480P';
        this.fileName.set(formData.fileName || '');
        this.isLocalImage.set(this.imageUrl().startsWith('data:'));
        this.displayImageUrl.set(this.isLocalImage() ? this.fileName() : this.imageUrl());
      } catch (error) {
        localStorage.removeItem('pixelda_animation_form');
      }
    }
  }

  onFormChange() {
    if (this.displayImageUrl() !== this.fileName()) {
      this.isLocalImage.set(false);
    }
    if (!this.isLocalImage()) {
      this.imageUrl.set(this.displayImageUrl());
    }
    this.saveFormData();
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && (file.type === 'image/png' || file.type === 'image/jpeg')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.imageUrl.set(e.target?.result as string);
        this.displayImageUrl.set(file.name);
        this.fileName.set(file.name);
        this.isLocalImage.set(true);
        this.onFormChange();
      };
      reader.readAsDataURL(file);
    }
    event.target.value = '';
  }

  triggerFileInput() {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    fileInput.click();
  }

  async generateWithAI() {
    if (!this.imageUrl()) {
      this.errorMessage.set(this.getNoImageMessage());
      return;
    }

    this.promptLoading.set(true);
    this.isGenerating.set(true);
    this.errorMessage.set('');
    this.result.set(null);

    try {
      // Step 1: AI generates animation prompt (built-in, no user key needed)
      const promptRequest: AnimationPromptRequest = {
        image_url: this.isLocalImage() ? '(local uploaded image)' : this.imageUrl(),
        motion_hint: this.motionHint.trim() || undefined,
        model_type: this.settingService.getActiveModel(),
      };

      const promptResult = await lastValueFrom(
        this.generationService.generateAnimationPrompt(promptRequest)
      );

      if (promptResult.error_info) {
        this.errorMessage.set(promptResult.error_info);
        this.isGenerating.set(false);
        this.promptLoading.set(false);
        return;
      }

      this.generatedPrompt.set(promptResult.prompt);
      this.promptLoading.set(false);
      this.saveFormData();

      // Step 2: Generate animation (needs user API key)
      if (!this.settingService.hasAnyApiKey()) {
        this.isGenerating.set(false);
        this.errorMessage.set(this.getNoApiKeyMessage());
        return;
      }
      this.doGenerateAnimation(promptResult.prompt);
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Failed to generate animation prompt');
      this.isGenerating.set(false);
      this.promptLoading.set(false);
    }
  }

  generateFromPrompt() {
    if (!this.settingService.hasAnyApiKey()) {
      this.errorMessage.set(this.getNoApiKeyMessage());
      return;
    }
    if (!this.imageUrl()) {
      this.errorMessage.set(this.getNoImageMessage());
      return;
    }
    const prompt = this.generatedPrompt().trim();
    if (!prompt) return;

    this.isGenerating.set(true);
    this.errorMessage.set('');
    this.result.set(null);
    this.doGenerateAnimation(prompt);
  }

  private doGenerateAnimation(prompt: string) {
    const request: VideoGenerationRequest = {
      base_image_url: this.imageUrl(),
      prompt: 'pixel-art game sprite animation, ' + prompt,
      resolution: this.resolution,
      task_id: this.generationService.generateTaskId('anim'),
      model_type: this.settingService.getActiveModel(),
    };

    this.generationService.generateVideo(request).subscribe({
      next: (response: GenerationResponse) => {
        this.isGenerating.set(false);
        if (response.url) {
          this.result.set(response);
          this.storeGenerationToHistory(response, request.prompt);
        } else if (response.error_info) {
          this.errorMessage.set(response.error_info);
        }
      },
      error: (error) => {
        this.isGenerating.set(false);
        this.errorMessage.set(error.message || 'Failed to generate animation');
      },
    });
  }

  private storeGenerationToHistory(result: GenerationResponse, prompt: string) {
    const historyItem = {
      id: result.task_id || `anim_${Date.now()}`,
      type: 'animation',
      url: result.url,
      prompt: prompt,
      baseImageUrl: this.imageUrl(),
      timestamp: new Date().toISOString(),
      resolution: this.resolution,
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

  reset() {
    this.imageUrl.set('');
    this.motionHint = '';
    this.generatedPrompt.set('');
    this.resolution = '480P';
    this.isLocalImage.set(false);
    this.displayImageUrl.set('');
    this.fileName.set('');
    this.result.set(null);
    this.errorMessage.set('');
    localStorage.removeItem('pixelda_animation_form');
  }

  navigateToSpriteSheet() {
    if (this.result() && this.result()!.url) {
      localStorage.setItem('pixelda_sprite_sheet_video_url', this.result()!.url);
      this.router.navigate(['/generate/sprite-sheet']);
    }
  }

  onThumbnailError() {}

  private getNoApiKeyMessage(): string {
    const lang = this.translate.currentLang || 'en';
    return lang === 'zh'
      ? '请先在设置页面配置 API Key'
      : 'Please configure your API Key in Settings first';
  }

  private getNoImageMessage(): string {
    const lang = this.translate.currentLang || 'en';
    return lang === 'zh'
      ? '请先提供基础图像'
      : 'Please provide a base image first';
  }
}
