import { StyleSheet, ScrollView, View, Text, TouchableOpacity } from "react-native";
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  content: {
    padding: 20,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%'
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: 16
  },
  badge: {
    backgroundColor: '#28a745',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 16
  },
  badgeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#764ba2',
    marginBottom: 12
  },
  text: {
    fontSize: 16,
    color: '#495057',
    lineHeight: 24,
    marginBottom: 12,
    width: 243,
    height: 58,
    position: "absolute",
    left: 50,
    top: 597
  },
  button: {
    backgroundColor: '#667eea',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8
  },
  buttonPressed: {
    backgroundColor: '#5568d3',
    transform: [{
      scale: 0.98
    }]
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600'
  },
  list: {
    marginTop: 8
  },
  listItem: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 24
  }
});
function ExtractedBlock() {
  const handlePress = () => {
    setCount(count + 1);
    setPressed(true);
    setTimeout(() => setPressed(false), 300);
  };
  return <ScrollView style={styles.container} data-no-code-ui-id="mrpak:App.jsx:487:524:ScrollView">
      <View style={styles.content} data-no-code-ui-id="mrpak:App.jsx:531:560:View">
        <Text style={styles.title} data-no-code-ui-id="mrpak:App.jsx:569:596:Text">Простой React Native тест</Text>
        <View style={styles.badge} data-no-code-ui-id="mrpak:App.jsx:637:664:View">
          <Text style={styles.badgeText} data-no-code-ui-id="mrpak:App.jsx:675:706:Text">Активен</Text>
        </View>

        <View style={styles.card} data-no-code-ui-id="mrpak:App.jsx:746:772:View">
          
          <Text style={styles.text} data-no-code-ui-id="mrpak:App.jsx:794:820:Text">
            Текущее значение: {count}
          </Text>
          <TouchableOpacity style={[styles.button, pressed && styles.buttonPressed]} onPress={handlePress} data-no-code-ui-id="mrpak:App.jsx:887:1008:TouchableOpacity">

            <Text style={styles.buttonText} data-no-code-ui-id="mrpak:App.jsx:1022:1054:Text">Увеличить счетчик</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card} data-no-code-ui-id="mrpak:App.jsx:1134:1160:View">
          <Text style={styles.cardTitle} data-no-code-ui-id="mrpak:App.jsx:1171:1202:Text">О компоненте</Text>
          <Text style={styles.text} data-no-code-ui-id="mrpak:App.jsx:1232:1258:Text">
            Этот компонент тестирует ReactNativeFramework:
          </Text>
          <View style={styles.list} data-no-code-ui-id="mrpak:App.jsx:1346:1372:View">
            <Text style={styles.listItem} data-no-code-ui-id="mrpak:App.jsx:1385:1415:Text">• Инструментация JSX</Text>
            <Text style={styles.listItem} data-no-code-ui-id="mrpak:App.jsx:1455:1485:Text">• Обработка зависимостей</Text>
            <Text style={styles.listItem} data-no-code-ui-id="mrpak:App.jsx:1529:1559:Text">• Применение стилей</Text>
            <Text style={styles.listItem} data-no-code-ui-id="mrpak:App.jsx:1598:1628:Text">• React Native Web рендеринг</Text>
          </View>
        </View>

        <View style={styles.card} data-no-code-ui-id="mrpak:App.jsx:1707:1733:View">
          <Text style={styles.cardTitle} data-no-code-ui-id="mrpak:App.jsx:1744:1775:Text">Состояние</Text>
          <Text style={styles.text} data-no-code-ui-id="mrpak:App.jsx:1802:1828:Text">
            Кнопка была нажата: {pressed ? 'Да' : 'Нет'}
          </Text>
        </View>
      </View>
    </ScrollView>;
}
export default ExtractedBlock;
