import { Command, Help, type ErrorOptions } from "commander";
import { getLocale, t } from "../i18n/index.js";

const headings: Record<string, string> = {
  "Usage:": "usageTitle",
  "Arguments:": "argumentsTitle",
  "Options:": "optionsTitle",
  "Global Options:": "globalOptionsTitle",
  "Commands:": "commandsTitle",
};

/** Commander exposes help formatting hooks but has no built-in locale catalog. */
export class LocalizedCommand extends Command {
  public constructor(name?: string) {
    super(name);
    this.helpOption("-h, --help", t("cli.help"));
    this.configureHelp({
      styleTitle: (title) => (headings[title] ? t(`cli.${headings[title]}`) : title),
      commandUsage: (command) =>
        localizeUsage(Help.prototype.commandUsage.call(new Help(), command)),
      subcommandTerm: (command) =>
        localizeUsage(Help.prototype.subcommandTerm.call(new Help(), command)),
      optionDescription: (option) =>
        Help.prototype.optionDescription
          .call(new Help(), option)
          .replace("(default:", `(${t("cli.defaultLabel")}`),
      argumentDescription: (argument) =>
        Help.prototype.argumentDescription
          .call(new Help(), argument)
          .replace("(default:", `(${t("cli.defaultLabel")}`),
    });
  }

  public localizeHelpCommands(): void {
    for (const command of this.commands) {
      if (command instanceof LocalizedCommand) command.localizeHelpCommands();
    }
    if (this.commands.length > 0) {
      this.addHelpCommand("help [command]", t("cli.helpCommand"));
    }
  }

  public override createCommand(name?: string): Command {
    return new LocalizedCommand(name);
  }

  public override error(message: string, options?: ErrorOptions): never {
    return super.error(localizeParserError(message), options);
  }
}

function localizeUsage(usage: string): string {
  return usage
    .replaceAll("[options]", t("cli.usageOptions"))
    .replaceAll("[command]", t("cli.usageCommand"));
}

// Adapt Commander 14's diagnostic boundary; i18next owns all translated text.
function localizeParserError(message: string): string {
  if (getLocale() === "en") return message;
  const patterns: readonly [RegExp, string][] = [
    [/^error: missing required argument '(?<value>.*)'$/u, "missingArgument"],
    [/^error: option '(?<value>.*)' argument missing$/u, "optionMissingArgument"],
    [/^error: required option '(?<value>.*)' not specified$/u, "requiredOption"],
    [/^error: unknown option '(?<value>[^\n]*)'/u, "unknownOption"],
    [/^error: unknown command '(?<value>[^\n]*)'/u, "unknownCommand"],
    [
      /^error: too many arguments(?: for '(?<command>.*)')?\. Expected (?<expected>\d+) arguments? but got (?<received>\d+)\.$/u,
      "excessArguments",
    ],
    [
      /^error: option '(?<option>.*)' argument '(?<value>.*)' is invalid\. (?<reason>.*)$/u,
      "invalidOptionArgument",
    ],
  ];
  for (const [pattern, key] of patterns) {
    const match = pattern.exec(message);
    if (!match) continue;
    const translated = t(`cli.${key}`, match.groups);
    const suggestion =
      /\n\(Did you mean (?<value>.*)\?\)$/u.exec(message) ??
      /\n\(Did you mean one of (?<value>.*)\?\)$/u.exec(message);
    return suggestion ? `${translated}\n${t("cli.suggestion", suggestion.groups)}` : translated;
  }
  return message;
}
