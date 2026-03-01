"use server";

import { createAdminClient } from "../supabase/server";
import { parseStringify } from "../utils";

export const createTransaction = async (transaction: CreateTransactionProps) => {
  try {
    const supabase = await createAdminClient();

    const { data: newTransaction, error } = await supabase
      .from('transactions')
      .insert({
        channel: 'online',
        category: 'Transfer',
        name: transaction.name,
        amount: parseFloat(transaction.amount),
        sender_id: transaction.senderId,
        sender_bank_id: transaction.senderBankId,
        receiver_id: transaction.receiverId,
        receiver_bank_id: transaction.receiverBankId,
        email: transaction.email,
      })
      .select()
      .single();

    if (error || !newTransaction) {
      console.error('Error creating transaction:', error);
      throw error;
    }

    return parseStringify(newTransaction);
  } catch (error) {
    console.log('Error in createTransaction:', error);
    return null;
  }
};

export const getTransactionsByBankId = async ({ bankId }: getTransactionsByBankIdProps) => {
  try {
    const supabase = await createAdminClient();

    // Get sender transactions
    const { data: senderTransactions, error: senderError } = await supabase
      .from('transactions')
      .select('*')
      .eq('sender_bank_id', bankId);

    // Get receiver transactions
    const { data: receiverTransactions, error: receiverError } = await supabase
      .from('transactions')
      .select('*')
      .eq('receiver_bank_id', bankId);

    if (senderError || receiverError) {
      console.error('Error fetching transactions:', senderError || receiverError);
      return { total: 0, documents: [] };
    }

    const transactions = {
      total: (senderTransactions?.length || 0) + (receiverTransactions?.length || 0),
      documents: [
        ...(senderTransactions || []),
        ...(receiverTransactions || []),
      ],
    };

    return parseStringify(transactions);
  } catch (error) {
    console.log('Error in getTransactionsByBankId:', error);
    return { total: 0, documents: [] };
  }
};
