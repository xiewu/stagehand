import { StagehandContainer } from "./StagehandContainer";
import { calculateViewportHeight } from "./utils";

export class GlobalPageContainer extends StagehandContainer {
  public getRootElement(): HTMLElement {
    return document.body;
  }

  public getViewportHeight(): number {
    return calculateViewportHeight();
  }

  public getScrollHeight(): number {
    return document.documentElement.scrollHeight;
  }

  public getScrollPosition(): number {
    return window.scrollY || document.documentElement.scrollTop;
  }

  public async scrollTo(offset: number): Promise<void> {
    // maybe a 1500ms delay
    await new Promise((resolve) => setTimeout(resolve, 1500));
    window.scrollTo({ top: offset, behavior: "smooth" });
    await this.waitForScrollEnd();
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
}
