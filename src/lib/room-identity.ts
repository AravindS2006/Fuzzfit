export function newVideoRoomName(classId: string) {
  return `geez-squad-${classId}`;
}
// Sessions that started before this additive migration keep their original room.
export function existingVideoRoomName(item: { id: string; videoRoomName: string | null }) {
  return item.videoRoomName ?? `fuzzfit-${item.id}`;
}
