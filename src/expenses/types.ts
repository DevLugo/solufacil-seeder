export interface Expense {
    fullName: string;
    date: Date;
    amount: number;
    leadId: string;
    description: string;
    accountType: string;
}

export interface ExcelExpensesRow {
    [key: string]: keyof Expense;
}