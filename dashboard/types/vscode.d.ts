declare module "vscode" {
  export interface Disposable {
    dispose(): void;
  }

  export interface OutputChannel extends Disposable {
    appendLine(value: string): void;
    show(preserveFocus?: boolean): void;
  }

  export interface ExtensionContext {
    subscriptions: Disposable[];
  }

  export interface StatusBarItem extends Disposable {
    text: string;
    tooltip?: string;
    command?: string;
    show(): void;
  }

  export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
  }

  export enum ProgressLocation {
    SourceControl = 1,
    Window = 10,
    Notification = 15,
  }

  export const window: {
    createOutputChannel(name: string): OutputChannel;
    createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem;
    showErrorMessage(message: string): Thenable<string | undefined>;
    showInformationMessage(message: string): Thenable<string | undefined>;
    withProgress<T>(
      options: { location: ProgressLocation; title?: string; cancellable?: boolean },
      task: () => Thenable<T> | T
    ): Thenable<T>;
  };

  export const workspace: {
    getConfiguration(section?: string): {
      get<T>(key: string): T | undefined;
    };
  };

  export const commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable;
  };
}
