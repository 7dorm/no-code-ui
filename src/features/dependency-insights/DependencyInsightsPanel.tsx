import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { DependencyInsight } from './useDependencyInsights';

type DependencyInsightsPanelProps = {
  hasProject: boolean;
  hasSelection: boolean;
  loading: boolean;
  error: string | null;
  scannedFileCount: number;
  insight: DependencyInsight | null;
  onOpenFile?: (filePath: string) => void;
};

function formatImportKind(kind: string) {
  switch (kind) {
    case 'default':
      return 'default import';
    case 'named':
      return 'named import';
    case 'namespace':
      return 'namespace import';
    case 'side-effect':
      return 'side-effect import';
    case 'css-import':
      return '@import';
    case 'html-link':
      return '<link href>';
    case 'html-script':
      return '<script src>';
    default:
      return kind;
  }
}

function buildSummary(insight: DependencyInsight) {
  if (insight.kind === 'component') {
    const fileWord = insight.importerCount === 1 ? 'файле' : 'файлах';
    const usageWord = insight.totalUsageCount === 1 ? 'раз' : 'раз';
    return `Найдено в ${insight.importerCount} ${fileWord}, использовано ${insight.totalUsageCount} ${usageWord}.`;
  }

  if (insight.kind === 'style') {
    const fileWord = insight.importerCount === 1 ? 'файле' : 'файлах';
    return `Файл стилей подключается в ${insight.importerCount} ${fileWord}.`;
  }

  const fileWord = insight.importerCount === 1 ? 'файле' : 'файлах';
  return `Файл импортируется или подключается в ${insight.importerCount} ${fileWord}.`;
}

export function DependencyInsightsPanel({
  hasProject,
  hasSelection,
  loading,
  error,
  scannedFileCount,
  insight,
  onOpenFile,
}: DependencyInsightsPanelProps) {
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Связи</Text>
        {scannedFileCount > 0 ? <Text style={styles.badge}>{scannedFileCount} файлов</Text> : null}
      </View>

      {!hasProject ? (
        <Text style={styles.emptyText}>Открой проект, чтобы построить карту зависимостей.</Text>
      ) : loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color="#0e639c" />
          <Text style={styles.hintText}>Индексирую проект и собираю импорты…</Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>Не удалось построить связи: {error}</Text>
      ) : !hasSelection ? (
        <Text style={styles.emptyText}>Выбери файл или компонент в дереве, и здесь появится список использований.</Text>
      ) : !insight ? (
        <Text style={styles.emptyText}>Для текущего выбора связи пока не определены.</Text>
      ) : (
        <>
          <View style={styles.targetCard}>
            <Text style={styles.targetLabel}>{insight.targetLabel}</Text>
            <Text style={styles.targetSubtitle}>{insight.targetSubtitle}</Text>
            <Text style={styles.summaryText}>{buildSummary(insight)}</Text>
            {insight.note ? <Text style={styles.noteText}>{insight.note}</Text> : null}
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {insight.items.length === 0 ? (
              <Text style={styles.emptyText}>Прямых использований не найдено.</Text>
            ) : (
              insight.items.map((item) => (
                <TouchableOpacity
                  key={`${insight.targetPath}:${item.importerPath}`}
                  style={styles.item}
                  onPress={() => onOpenFile?.(item.importerPath)}
                >
                  <View style={styles.itemTopRow}>
                    <Text style={styles.itemLabel}>{item.importerLabel}</Text>
                    {insight.kind === 'component' ? (
                      <Text style={styles.itemCount}>{item.usageCount}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.itemPath}>{item.importerPath}</Text>
                  <Text style={styles.itemMeta}>
                    {item.importKinds.map(formatImportKind).join(', ')}
                    {item.matchedLocalNames.length > 0 ? ` • ${item.matchedLocalNames.join(', ')}` : ''}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    minHeight: 0,
    maxHeight: 240,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#181818',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  title: {
    color: '#f3f4f6',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  badge: {
    color: '#9ca3af',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  centerState: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 8,
  },
  targetCard: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: '#151515',
  },
  targetLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  targetSubtitle: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
  summaryText: {
    color: '#d1d5db',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  noteText: {
    color: '#fbbf24',
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18,
  },
  list: {
    minHeight: 0,
  },
  listContent: {
    padding: 8,
    gap: 8,
  },
  item: {
    backgroundColor: '#202020',
    borderWidth: 1,
    borderColor: '#2f2f2f',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemLabel: {
    color: '#f3f4f6',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  itemCount: {
    minWidth: 22,
    textAlign: 'center',
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(14, 99, 156, 0.22)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  itemPath: {
    color: '#9ca3af',
    fontSize: 11,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  itemMeta: {
    color: '#d1d5db',
    fontSize: 11,
    marginTop: 6,
    lineHeight: 16,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  hintText: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
});
