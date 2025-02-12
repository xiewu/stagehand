import { StagehandContainer } from "./StagehandContainer";
import { collectCandidateElements } from "./candidateCollector";
import { DomChunk } from "./DomChunk";
import { calculateViewportHeight } from "./utils";

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
    candidateContainer?: HTMLElement,
  ): Promise<DomChunk[]> {
    const chunks: DomChunk[] = [];

    const maxOffset = this.getScrollHeight() - this.getViewportHeight();
    const finalEnd = Math.min(endOffset, maxOffset);
    let index = 0;

    for (let current = startOffset; current <= finalEnd; current += chunkSize) {
      await this.scrollTo(current);

      const { outputString, selectorMap } = await collectCandidateElements(
        candidateContainer || document.body,
        index,
      );

      chunks.push({
        startOffset: current,
        endOffset: current + chunkSize,
        outputString,
        selectorMap,
      });

      index += Object.keys(selectorMap).length;
    }

    await this.scrollTo(0);

    return chunks;
  }
}
