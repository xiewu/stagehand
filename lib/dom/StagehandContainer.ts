import { DomChunk } from "@/lib/dom/DomChunk";

export interface StagehandContainer {
  getViewportHeight(): number;

  getScrollHeight(): number;

  scrollTo(offset: number): Promise<void>;

  getRootElement(): HTMLElement | Document;

  scrollIntoView(element?: HTMLElement): Promise<void>;

  getScrollPosition(): number;

  collectDomChunks?(
    startOffset: number,
    endOffset: number,
    chunkSize: number,
    candidateContainer?: HTMLElement,
  ): Promise<DomChunk[]>;
}
