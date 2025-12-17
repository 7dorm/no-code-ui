import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#667eea',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#667eea',
  },
  tabText: {
    fontSize: 16,
    color: '#6c757d',
  },
  tabTextActive: {
    color: '#667eea',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: 16,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#764ba2',
    marginBottom: 12,
  },
  cardText: {
    fontSize: 16,
    color: '#495057',
    lineHeight: 24,
    marginBottom: 8,
  },
  listItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  listItemCompleted: {
    backgroundColor: '#e7f5ec',
    borderWidth: 1,
    borderColor: '#28a745',
  },
  listItemText: {
    fontSize: 16,
    color: '#495057',
  },
  listItemTextCompleted: {
    color: '#28a745',
    textDecorationLine: 'line-through',
  },
  checkmark: {
    fontSize: 20,
    color: '#28a745',
    fontWeight: 'bold',
  },
cardTextMrpak1: {fontSize: 16, color: '#495057', lineHeight: 24, marginBottom: 8, position: "relative", left: 1, top: -36}, cardTitleMrpak1: {fontSize: 18, fontWeight: '700', color: '#764ba2', marginBottom: 12, position: "relative", left: -346, top: -498.5}});

export default styles;

