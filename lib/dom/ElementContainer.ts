import { StagehandContainer } from "./StagehandContainer";
import { DomChunk } from "./DomChunk";
import { collectDomChunksShared } from "@/lib/dom/chunkCollector";

export class ElementContainer implements StagehandContainer {
  constructor(private el: HTMLElement) {}

  public getRootElement(): HTMLElement {
    return this.el;
  }

  public async scrollIntoView(element?: HTMLElement): Promise<void> {
    if (!element) {
      // Just scroll ourselves to top
      this.el.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // If we want to ensure `element` is visible within `this.el`:
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    await this.waitForScrollEnd();
  }

  public getViewportHeight(): number {
    return this.el.clientHeight;
  }

  public getScrollHeight(): number {
    return this.el.scrollHeight;
  }

  public getScrollPosition(): number {
    return this.el.scrollTop;
  }

  public async scrollTo(offset: number): Promise<void> {
    this.el.scrollTo({ top: offset, behavior: "smooth" });
    await this.waitForScrollEnd();
  }

  private async waitForScrollEnd(): Promise<void> {
    return new Promise<void>((resolve) => {
      let scrollEndTimer: number;
      const handleScroll = () => {
        clearTimeout(scrollEndTimer);
        scrollEndTimer = window.setTimeout(() => {
          this.el.removeEventListener("scroll", handleScroll);
          resolve();
        }, 100);
      };
      this.el.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
    });
  }

  /**
   * Collect multiple DomChunks from startOffset to endOffset in increments of chunkSize.
   */
  public async collectDomChunks(
    startOffset: number,
    endOffset: number,
    chunkSize: number,
    scrollBackToTop: boolean = true,
    candidateContainer?: HTMLElement,
  ): Promise<DomChunk[]> {
    return collectDomChunksShared(
      this,
      startOffset,
      endOffset,
      chunkSize,
      scrollBackToTop,
      candidateContainer,
    );
  }
}
