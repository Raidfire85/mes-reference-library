import * as vscode from 'vscode';
import { findMesTagAtPosition } from './sbc/sbcParser';
import {
  formatCrossProfileHoverMarkdown,
  getDistinctOtherProfilesForTag,
  ProfileTagIndex,
  shouldShowCrossProfileHint,
} from './sbc/profileTagIndex';
import {
  applyValueSpecOverrides,
  formatAllowedValuesHoverHint,
  inferValueSpecFromTagName,
  shouldShowAllowedValuesHoverHint,
} from './sbc/tagMetadata';
import { getTagMetadata, TagRegistry } from './sbc/tagRegistry';
import { getProfileHeaders } from './sbc/profileHeaders';

export type ValidationContextLoader = () => Promise<{
  registry: TagRegistry;
  profileTagIndex: ProfileTagIndex | null;
}>;

export function registerSbcTagHoverProvider(
  context: vscode.ExtensionContext,
  loadValidationContext: ValidationContextLoader
): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { pattern: '**/*.sbc' },
      {
        async provideHover(
          document: vscode.TextDocument,
          position: vscode.Position
        ): Promise<vscode.Hover | null> {
          if (!document.fileName.toLowerCase().endsWith('.sbc')) {
            return null;
          }

          const match = findMesTagAtPosition(
            document.getText(),
            position.line,
            position.character
          );
          if (!match?.profile.header) {
            return null;
          }

          const { registry, profileTagIndex } = await loadValidationContext();
          const { tag, profile } = match;
          const header = profile.header;
          const wikiFile = header ? getProfileHeaders()[header] : undefined;
          const parts: string[] = [];

          if (profileTagIndex && header && shouldShowCrossProfileHint(profileTagIndex, tag.tagName, header)) {
            const hint = formatCrossProfileHoverMarkdown(
              tag.tagName,
              getDistinctOtherProfilesForTag(profileTagIndex, tag.tagName, header)
            );
            if (hint) {
              parts.push(hint);
            }
          }

          if (wikiFile) {
            const metadata = getTagMetadata(registry, tag.tagName, wikiFile);
            let valueSpec = metadata?.valueSpec ?? inferValueSpecFromTagName(tag.tagName);
            if (valueSpec) {
              valueSpec = applyValueSpecOverrides(tag.tagName, valueSpec);
            }
            if (valueSpec && shouldShowAllowedValuesHoverHint(valueSpec)) {
              parts.push(formatAllowedValuesHoverHint(valueSpec));
            }
          }

          if (parts.length === 0) {
            return null;
          }

          const range = new vscode.Range(
            tag.line,
            tag.column,
            tag.line,
            tag.column + tag.raw.length
          );

          return new vscode.Hover(new vscode.MarkdownString(parts.join('\n\n')), range);
        },
      }
    )
  );
}
