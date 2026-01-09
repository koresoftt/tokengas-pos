import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  refreshOutline,
  checkmarkCircleOutline,
  timeOutline,
} from 'ionicons/icons';

export function registerAppIcons() {
  addIcons({
    'alert-circle-outline': alertCircleOutline,
    'refresh-outline': refreshOutline,
    'checkmark-circle-outline': checkmarkCircleOutline,
    'time-outline': timeOutline,
  });
}
