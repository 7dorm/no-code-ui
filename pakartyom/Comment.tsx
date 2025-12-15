import React, {useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, Image, StyleSheet} from 'react-native';
import Database, {BASE_URL} from '../database';

// Компонент для отображения ошибки
const CommentError = ({ error }) => (
	<View style={[styles.commentBubble, styles.errorComment]}>
		<Text style={styles.errorText}>Ошибка загрузки комментария</Text>
		<Text style={styles.errorDetails}>{error?.message || 'Неизвестная ошибка'}</Text>
	</View>
);


export default function Comment({ comment, currentUser, toggleLike }) {
	// Проверяем, что comment и currentUser существуют
	if (!comment || !currentUser) {
		// console.log('Comment or currentUser is missing:', { comment, currentUser });
		return <CommentError error={{ message: 'Отсутствуют данные комментария или пользователя' }} />;
	}

	const isMine = comment.createdByIdUser === currentUser.idUser;
	const [likes, setLikes] = useState([]);
	const [likedByMe , setLikedByMe] = useState(false);
	const [hasError, setHasError] = useState(false);
	const [error, setError] = useState(null);

	// Debug logs
	// console.log('Comment data:', {
	// 	id: comment.idComment,
	// 	text: comment.text,
	// 	displayedName: comment.displayedName,
	// 	username: comment.username,
	// 	images: comment.images,
	// 	createdByIdUser: comment.createdByIdUser,
	// 	currentUserId: currentUser.idUser
	// });

	useEffect(() => {
		if (comment.idComment) {
			getLikes();
		}
	}, [comment.idComment]);

	const getLikes = async () => {
		try {
			const data = await Database.getCommentLikes(Number(comment.idComment));
			setLikes(data || []);
			let tested = true;
			if (data && Array.isArray(data)) {
				data.forEach((item) => {
					if (item.idUser === currentUser.idUser){
						setLikedByMe(true);
						tested = false;
					}
				})
			}
			if (tested) {
				setLikedByMe(false);
			}
		} catch (error) {
			console.error('Error getting likes:', error);
			setLikes([]);
			setLikedByMe(false);
		}
	}

	// Безопасная обработка изображений
	const renderImages = () => {
		try {
			// Проверяем, что images существует и является массивом
			if (!comment.images || !Array.isArray(comment.images)) {
				return null;
			}

			// Фильтруем только валидные строки
			const validImages = comment.images.filter(img =>
				img && typeof img === 'string' && img.trim().length > 0
			);

			if (validImages.length === 0) {
				return null;
			}

			return validImages.map((src, i) => {
				const imageUrl = BASE_URL + src;
				// console.log('Rendering image:', imageUrl);

				return (
					<Image
						key={`image-${comment.idComment}-${i}`}
						source={{uri: imageUrl}}
						style={{width: 200, height: 200, marginTop: 6, borderRadius: 8}}
						resizeMode="cover"
						onError={(error) => {
							// console.log('Image load error:', error.nativeEvent.error, 'URL:', imageUrl);
							setError({ message: `Ошибка загрузки изображения: ${imageUrl}` });
						}}
						onLoad={() => console.log('Image loaded successfully:', imageUrl)}
					/>
				);
			});
		} catch (error) {
			console.error('Error rendering images:', error);
			setError(error);
			return null;
		}
	};

	// Если произошла ошибка, показываем компонент ошибки
	if (hasError || error) {
		return <CommentError error={error} />;
	}

	return (
		<View
			style={[
				styles.commentBubble,
				isMine ? styles.myComment : styles.otherComment,
			]}
		>
			<Text style={styles.author}>
				{comment.displayedName || comment.username || 'Аноним'}
			</Text>
			<Text style={styles.commentText}>
				{comment.text || ''}
			</Text>
			{renderImages()}

			<TouchableOpacity onPress={() => toggleLike(comment)}>
// TEST
			</TouchableOpacity>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#fff',
	},
	centered: {
		justifyContent: 'center',
		alignItems: 'center',
	},
	commentsContainer: {
		padding: 12,
	},
	commentBubble: {
		marginBottom: 10,
		padding: 12,
		borderRadius: 12,
		maxWidth: '90%',
	},
	myComment: {
		alignSelf: 'flex-end',
		backgroundColor: '#d0f0c0',
	},
	otherComment: {
		alignSelf: 'flex-start',
		backgroundColor: '#e6e6e6',
	},
	author: {
		fontWeight: 'bold',
		color: '#333',
		marginBottom: 4,
	},
	commentText: {
		color: '#000',
		fontSize: 15,
		marginBottom: 4,
	},
	inputContainer: {
		flexDirection: 'row',
		padding: 10,
		borderTopWidth: 1,
		borderColor: '#ccc',
		backgroundColor: '#f9f9f9',
		alignItems: 'center',
		flexWrap: 'wrap',
	},
	textInput: {
		flex: 1,
		borderColor: '#ccc',
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 8,
		marginRight: 10,
		fontSize: 15,
		backgroundColor: '#fff',
		color: '#000',
	},
	errorComment: {
		backgroundColor: '#ffebee',
		borderColor: '#f44336',
		borderWidth: 1,
	},
	errorText: {
		color: '#d32f2f',
		fontWeight: 'bold',
		marginBottom: 4,
	},
	errorDetails: {
		color: '#d32f2f',
		fontSize: 12,
	},
});
