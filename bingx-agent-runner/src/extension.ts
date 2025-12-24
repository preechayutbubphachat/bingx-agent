import * as vscode from "vscode";

let output: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel("BingX Agent Runner");

  // ✅ สร้างปุ่มบน Status Bar
  const statusButton = vscode.window.createStatusBarItem(
	vscode.StatusBarAlignment.Left,
	100
  );
  statusButton.text = "$(play-circle) Run Snapshot";
  statusButton.tooltip = "Run /run_full_snapshot on bingx-agent";
  statusButton.command = "bingx.runFullSnapshot";
  statusButton.show();

  // ✅ คำสั่งหลัก (กดปุ่มแล้วเรียก endpoint)
  const disposable = vscode.commands.registerCommand(
	"bingx.runFullSnapshot",
	async () => {
	  const cfg = vscode.workspace.getConfiguration("bingxAgent");
	  const baseUrl = cfg.get<string>("baseUrl") ?? "http://localhost:3000";
	  const symbol = cfg.get<string>("symbol") ?? "BTC-USDT";
	  const klineLimit = cfg.get<number>("klineLimit") ?? 200;
	  const depthLimit = cfg.get<number>("depthLimit") ?? 50;

	  const url = `${baseUrl}/run_full_snapshot?symbol=${encodeURIComponent(
		symbol
	  )}&klineLimit=${klineLimit}&depthLimit=${depthLimit}`;

	  output.show(true);
	  output.appendLine(`Calling: ${url}`);

	  await vscode.window.withProgress(
		{
		  location: vscode.ProgressLocation.Notification,
		  title: "BingX: Running full snapshot…",
		  cancellable: false,
		},
		async () => {
		  try {
			const res = await fetch(url);
			const text = await res.text();

			output.appendLine(`Status: ${res.status}`);
			output.appendLine(`Response: ${text}`);
			output.appendLine("----");

			if (!res.ok) {
			  vscode.window.showErrorMessage(
				`Snapshot failed (${res.status}). Check Output: BingX Agent Runner`
			  );
			  return;
			}

			vscode.window.showInformationMessage(
			  "✅ Snapshot completed. market_snapshot.json updated."
			);
		  } catch (err: any) {
			output.appendLine(`Error: ${err?.message ?? String(err)}`);
			output.appendLine("----");
			vscode.window.showErrorMessage(
			  "❌ Could not reach bingx-agent server. Is it running on localhost:3000?"
			);
		  }
		}
	  );
	}
  );

  context.subscriptions.push(disposable, statusButton, output);
}

export function deactivate() {}
