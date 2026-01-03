export type CalendarListItem = {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  accountEmail?: string;
  accessRole?: string;
};

export type AllDayEvent = {
  id: string;
  summary: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (exclusive)
  calendarId?: string;
};

