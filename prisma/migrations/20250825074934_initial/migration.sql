-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "password" TEXT,
    "role" TEXT DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "oldId" TEXT,
    "routes" TEXT,
    "personalData" TEXT,
    "type" TEXT,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "municipality" TEXT,
    "route" TEXT,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Municipality" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "state" TEXT,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loantype" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "weekDuration" INTEGER,
    "rate" DECIMAL(10,2) NOT NULL,
    "loanPaymentComission" DECIMAL(10,2) DEFAULT 0,
    "loanGrantedComission" DECIMAL(10,2) DEFAULT 0,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Loantype_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phone" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "personalData" TEXT,

    CONSTRAINT "Phone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "street" TEXT NOT NULL DEFAULT '',
    "exteriorNumber" TEXT NOT NULL DEFAULT '',
    "interiorNumber" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "references" TEXT NOT NULL DEFAULT '',
    "location" TEXT,
    "personalData" TEXT,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Borrower" (
    "id" TEXT NOT NULL,
    "personalData" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "loanFinishedCount" INTEGER DEFAULT 0,

    CONSTRAINT "Borrower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalData" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL DEFAULT '',
    "clientCode" TEXT,
    "birthDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "PersonalData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "oldId" TEXT,
    "requestedAmount" DECIMAL(10,2) NOT NULL,
    "amountGived" DECIMAL(10,2) NOT NULL,
    "loantype" TEXT,
    "signDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "badDebtDate" TIMESTAMP(3),
    "profitAmount" DECIMAL(10,2),
    "avalName" TEXT NOT NULL DEFAULT '',
    "avalPhone" TEXT NOT NULL DEFAULT '',
    "grantor" TEXT,
    "lead" TEXT,
    "snapshotLeadId" TEXT,
    "snapshotLeadAssignedAt" TIMESTAMP(3),
    "borrower" TEXT,
    "previousLoan" TEXT,
    "totalDebtAcquired" DECIMAL(12,2),
    "expectedWeeklyPayment" DECIMAL(12,2),
    "totalPaid" DECIMAL(12,2),
    "pendingAmountStored" DECIMAL(12,2),
    "comissionAmount" DECIMAL(18,4),
    "finishedDate" TIMESTAMP(3),
    "renewedDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT,
    "snapshotRouteId" TEXT NOT NULL DEFAULT '',
    "snapshotRouteName" TEXT NOT NULL DEFAULT '',
    "excludedByCleanup" TEXT,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanPayment" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2),
    "comission" DECIMAL(18,4),
    "receivedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "oldLoanId" TEXT,
    "loan" TEXT,
    "type" TEXT,
    "leadPaymentReceived" TEXT,
    "paymentMethod" TEXT,

    CONSTRAINT "LoanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(18,4),
    "date" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT,
    "incomeSource" TEXT,
    "expenseSource" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "route" TEXT,
    "lead" TEXT,
    "snapshotLeadId" TEXT NOT NULL DEFAULT '',
    "sourceAccount" TEXT,
    "destinationAccount" TEXT,
    "loan" TEXT,
    "loanPayment" TEXT,
    "profitAmount" DECIMAL(10,2) DEFAULT 0,
    "returnToCapital" DECIMAL(10,2) DEFAULT 0,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayment" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(18,4),
    "loan" TEXT,
    "employee" TEXT,

    CONSTRAINT "CommissionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadPaymentType" (
    "id" TEXT NOT NULL,
    "type" TEXT,

    CONSTRAINT "LeadPaymentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FalcoCompensatoryPayment" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "leadPaymentReceived" TEXT,

    CONSTRAINT "FalcoCompensatoryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadPaymentReceived" (
    "id" TEXT NOT NULL,
    "expectedAmount" DECIMAL(18,4),
    "paidAmount" DECIMAL(18,4),
    "cashPaidAmount" DECIMAL(18,4),
    "bankPaidAmount" DECIMAL(18,4),
    "falcoAmount" DECIMAL(18,4),
    "paymentStatus" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "agent" TEXT,
    "lead" TEXT,

    CONSTRAINT "LeadPaymentReceived_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "type" TEXT,
    "amount" DECIMAL(18,4),
    "route" TEXT,
    "updatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "operation" TEXT,
    "modelName" TEXT NOT NULL DEFAULT '',
    "recordId" TEXT NOT NULL DEFAULT '',
    "userName" TEXT NOT NULL DEFAULT '',
    "userEmail" TEXT NOT NULL DEFAULT '',
    "userRole" TEXT NOT NULL DEFAULT '',
    "sessionId" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "previousValues" JSONB,
    "newValues" JSONB,
    "changedFields" JSONB,
    "description" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "user" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioCleanup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "cleanupDate" TIMESTAMP(3) NOT NULL,
    "fromDate" TIMESTAMP(3),
    "toDate" TIMESTAMP(3),
    "excludedLoansCount" INTEGER,
    "excludedAmount" DECIMAL(18,4),
    "route" TEXT,
    "executedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "PortfolioCleanup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_Loan_collaterals" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Loan_collaterals_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_oldId_key" ON "Employee"("oldId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_personalData_key" ON "Employee"("personalData");

-- CreateIndex
CREATE INDEX "Employee_routes_idx" ON "Employee"("routes");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE INDEX "Location_municipality_idx" ON "Location"("municipality");

-- CreateIndex
CREATE INDEX "Location_route_idx" ON "Location"("route");

-- CreateIndex
CREATE INDEX "Municipality_state_idx" ON "Municipality"("state");

-- CreateIndex
CREATE INDEX "Phone_personalData_idx" ON "Phone"("personalData");

-- CreateIndex
CREATE INDEX "Address_location_idx" ON "Address"("location");

-- CreateIndex
CREATE INDEX "Address_personalData_idx" ON "Address"("personalData");

-- CreateIndex
CREATE UNIQUE INDEX "Borrower_personalData_key" ON "Borrower"("personalData");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalData_clientCode_key" ON "PersonalData"("clientCode");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_oldId_key" ON "Loan"("oldId");

-- CreateIndex
CREATE INDEX "Loan_loantype_idx" ON "Loan"("loantype");

-- CreateIndex
CREATE INDEX "Loan_grantor_idx" ON "Loan"("grantor");

-- CreateIndex
CREATE INDEX "Loan_lead_idx" ON "Loan"("lead");

-- CreateIndex
CREATE INDEX "Loan_borrower_idx" ON "Loan"("borrower");

-- CreateIndex
CREATE INDEX "Loan_previousLoan_idx" ON "Loan"("previousLoan");

-- CreateIndex
CREATE INDEX "Loan_excludedByCleanup_idx" ON "Loan"("excludedByCleanup");

-- CreateIndex
CREATE INDEX "LoanPayment_loan_idx" ON "LoanPayment"("loan");

-- CreateIndex
CREATE INDEX "LoanPayment_leadPaymentReceived_idx" ON "LoanPayment"("leadPaymentReceived");

-- CreateIndex
CREATE INDEX "Transaction_route_idx" ON "Transaction"("route");

-- CreateIndex
CREATE INDEX "Transaction_lead_idx" ON "Transaction"("lead");

-- CreateIndex
CREATE INDEX "Transaction_sourceAccount_idx" ON "Transaction"("sourceAccount");

-- CreateIndex
CREATE INDEX "Transaction_destinationAccount_idx" ON "Transaction"("destinationAccount");

-- CreateIndex
CREATE INDEX "Transaction_loan_idx" ON "Transaction"("loan");

-- CreateIndex
CREATE INDEX "Transaction_loanPayment_idx" ON "Transaction"("loanPayment");

-- CreateIndex
CREATE INDEX "CommissionPayment_loan_idx" ON "CommissionPayment"("loan");

-- CreateIndex
CREATE INDEX "CommissionPayment_employee_idx" ON "CommissionPayment"("employee");

-- CreateIndex
CREATE INDEX "FalcoCompensatoryPayment_leadPaymentReceived_idx" ON "FalcoCompensatoryPayment"("leadPaymentReceived");

-- CreateIndex
CREATE INDEX "LeadPaymentReceived_agent_idx" ON "LeadPaymentReceived"("agent");

-- CreateIndex
CREATE INDEX "LeadPaymentReceived_lead_idx" ON "LeadPaymentReceived"("lead");

-- CreateIndex
CREATE INDEX "Account_route_idx" ON "Account"("route");

-- CreateIndex
CREATE INDEX "AuditLog_operation_idx" ON "AuditLog"("operation");

-- CreateIndex
CREATE INDEX "AuditLog_modelName_idx" ON "AuditLog"("modelName");

-- CreateIndex
CREATE INDEX "AuditLog_recordId_idx" ON "AuditLog"("recordId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_user_idx" ON "AuditLog"("user");

-- CreateIndex
CREATE INDEX "PortfolioCleanup_route_idx" ON "PortfolioCleanup"("route");

-- CreateIndex
CREATE INDEX "PortfolioCleanup_executedBy_idx" ON "PortfolioCleanup"("executedBy");

-- CreateIndex
CREATE INDEX "_Loan_collaterals_B_index" ON "_Loan_collaterals"("B");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_routes_fkey" FOREIGN KEY ("routes") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_personalData_fkey" FOREIGN KEY ("personalData") REFERENCES "PersonalData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_municipality_fkey" FOREIGN KEY ("municipality") REFERENCES "Municipality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_route_fkey" FOREIGN KEY ("route") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Municipality" ADD CONSTRAINT "Municipality_state_fkey" FOREIGN KEY ("state") REFERENCES "State"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phone" ADD CONSTRAINT "Phone_personalData_fkey" FOREIGN KEY ("personalData") REFERENCES "PersonalData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_personalData_fkey" FOREIGN KEY ("personalData") REFERENCES "PersonalData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Borrower" ADD CONSTRAINT "Borrower_personalData_fkey" FOREIGN KEY ("personalData") REFERENCES "PersonalData"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_loantype_fkey" FOREIGN KEY ("loantype") REFERENCES "Loantype"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_grantor_fkey" FOREIGN KEY ("grantor") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_borrower_fkey" FOREIGN KEY ("borrower") REFERENCES "Borrower"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_previousLoan_fkey" FOREIGN KEY ("previousLoan") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_excludedByCleanup_fkey" FOREIGN KEY ("excludedByCleanup") REFERENCES "PortfolioCleanup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_loan_fkey" FOREIGN KEY ("loan") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_leadPaymentReceived_fkey" FOREIGN KEY ("leadPaymentReceived") REFERENCES "LeadPaymentReceived"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_route_fkey" FOREIGN KEY ("route") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_sourceAccount_fkey" FOREIGN KEY ("sourceAccount") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_destinationAccount_fkey" FOREIGN KEY ("destinationAccount") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_loan_fkey" FOREIGN KEY ("loan") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_loanPayment_fkey" FOREIGN KEY ("loanPayment") REFERENCES "LoanPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_loan_fkey" FOREIGN KEY ("loan") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_employee_fkey" FOREIGN KEY ("employee") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FalcoCompensatoryPayment" ADD CONSTRAINT "FalcoCompensatoryPayment_leadPaymentReceived_fkey" FOREIGN KEY ("leadPaymentReceived") REFERENCES "LeadPaymentReceived"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadPaymentReceived" ADD CONSTRAINT "LeadPaymentReceived_agent_fkey" FOREIGN KEY ("agent") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadPaymentReceived" ADD CONSTRAINT "LeadPaymentReceived_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_route_fkey" FOREIGN KEY ("route") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioCleanup" ADD CONSTRAINT "PortfolioCleanup_route_fkey" FOREIGN KEY ("route") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioCleanup" ADD CONSTRAINT "PortfolioCleanup_executedBy_fkey" FOREIGN KEY ("executedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Loan_collaterals" ADD CONSTRAINT "_Loan_collaterals_A_fkey" FOREIGN KEY ("A") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Loan_collaterals" ADD CONSTRAINT "_Loan_collaterals_B_fkey" FOREIGN KEY ("B") REFERENCES "PersonalData"("id") ON DELETE CASCADE ON UPDATE CASCADE;
