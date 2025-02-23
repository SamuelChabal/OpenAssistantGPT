import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { RequiresHigherPlanError } from "@/lib/exceptions";
import { getUserSubscriptionPlan } from "@/lib/subscription";
import { customizationSchema } from "@/lib/validations/customization";
import { getServerSession } from "next-auth";
import { z } from "zod";

const routeContextSchema = z.object({
    params: z.object({
        chatbotId: z.string(),
    }),
})

async function verifyCurrentUserHasAccessToChatbot(chatbotId: string) {
    const session = await getServerSession(authOptions)

    const count = await db.chatbot.count({
        where: {
            id: chatbotId,
            userId: session?.user?.id,
        },
    })

    return count > 0
}

export async function PATCH(
    req: Request,
    context: z.infer<typeof routeContextSchema>
) {
    try {
        const session = await getServerSession(authOptions)
        const { params } = routeContextSchema.parse(context)

        if (!(await verifyCurrentUserHasAccessToChatbot(params.chatbotId))) {
            return new Response(null, { status: 403 })
        }

        const subscriptionPlan = await getUserSubscriptionPlan(session?.user?.id || '')

        if (subscriptionPlan.disableBranding === false) {
            throw new RequiresHigherPlanError()
        }

        const body = await req.json()
        const payload = customizationSchema.parse(body)

        const chatbot = await db.chatbot.update({
            where: {
                id: params.chatbotId
            },
            data: {
                displayBranding: payload.displayBranding,
                chatTitle: payload.chatTitle,
                chatMessagePlaceHolder: payload.chatMessagePlaceHolder
            },
            select: {
                id: true,
                name: true,
                displayBranding: true,
            },
        })

        return new Response(JSON.stringify(chatbot))
    } catch (error) {
        console.log(error)
        if (error instanceof z.ZodError) {
            return new Response(JSON.stringify(error.issues), { status: 422 })
        }

        if (error instanceof RequiresHigherPlanError) {
            return new Response("Requires Higher Plan", { status: 402 })
        }

        return new Response(null, { status: 500 })
    }
}