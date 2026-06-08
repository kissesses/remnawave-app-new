export function formatWelcomeText(template: string | undefined, name: string | null): string {
  if (!template?.trim()) return "Главная";
  return template.replace(/\{name\}/gi, name ?? "друг");
}
