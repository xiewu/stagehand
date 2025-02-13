import { StagehandContainer } from "./StagehandContainer";
import { DomChunk } from "./DomChunk";
import { calculateViewportHeight } from "./utils";
import { collectDomChunksShared } from "@/lib/dom/chunkCollector";

export class GlobalPageContainer implements StagehandContainer {
  public getViewportHeight(): number {
    return calculateViewportHeight();
  }

  public getScrollHeight(): number {
    return document.documentElement.scrollHeight;
  }

  public getRootElement(): HTMLElement | Document {
    return document.body;
  }

  public async scrollIntoView(element?: HTMLElement): Promise<void> {
    if (!element) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const rect = element.getBoundingClientRect();
      const currentY = window.scrollY || document.documentElement.scrollTop;
      const elementY = currentY + rect.top;
      window.scrollTo({ top: elementY, behavior: "smooth" });
    }
    await this.waitForScrollEnd();
  }

  public getScrollPosition(): number {
    return window.scrollY || document.documentElement.scrollTop;
  }

  public async scrollTo(offset: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    window.scrollTo({ top: offset, left: 0, behavior: "smooth" });
    await this.waitForScrollEnd();
  }

  private async waitForScrollEnd(): Promise<void> {
    return new Promise<void>((resolve) => {
      let scrollEndTimer: number;
      const handleScroll = () => {
        clearTimeout(scrollEndTimer);
        scrollEndTimer = window.setTimeout(() => {
          window.removeEventListener("scroll", handleScroll);
          resolve();
        }, 100);
      };
      window.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
    });
  }

  /**
   * Collect multiple DomChunks from `startOffset` up to `endOffset`, stepping by chunkSize.
   * BFS each time. This effectively replaces your multi-chunk logic in processAllOfDom.
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
