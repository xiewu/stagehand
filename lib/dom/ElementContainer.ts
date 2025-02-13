import { StagehandContainer } from "./StagehandContainer";

export class ElementContainer extends StagehandContainer {
  constructor(private el: HTMLElement) {
    super();
  }

  public getRootElement(): HTMLElement {
    return this.el;
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

  public async scrollIntoView(element?: HTMLElement): Promise<void> {
    if (!element) {
      this.el.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
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
}
