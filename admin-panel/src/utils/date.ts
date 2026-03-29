import { formatDistanceToNowStrict, format } from "date-fns";

export function formatDate(value: string | Date, pattern = "dd MMM yyyy") {
  return format(new Date(value), pattern);
}

export function formatDateTime(value: string | Date) {
  return format(new Date(value), "dd MMM yyyy, hh:mm a");
}

export function relativeTime(value: string | Date) {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}
